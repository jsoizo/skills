// Per-session watcher started by `talkback on`. Usage: bun watcher.ts <session-id>
import fs from "node:fs"
import path from "node:path"
import { ClaudeAdapter } from "./lib/adapters/claude"
import { CodexAdapter } from "./lib/adapters/codex"
import type { AgentEvent } from "./lib/adapters/types"
import { chunkSentences, play, Synthesizer, voiceConfigFromEnv } from "./lib/audio"
import { AbortedError, PlayLock } from "./lib/lock"
import { lastSpeakerPath, playLockPath, sessionLogPath, waitingDir } from "./lib/paths"
import { isAlive, procRef } from "./lib/proc"
import { loadDictionaries, SayReadingProfile } from "./lib/reading"
import { liveSessions, readState, removeState, writeState, type SessionState } from "./lib/state"
import { cleanup, messageToSpeech, questionToSpeech } from "./lib/text"

const TAIL_POLL_MS = 250
const LIVENESS_POLL_MS = 2000
const LOG_MAX_BYTES = 1024 * 1024
// Claude Code creates the continued transcript a few seconds after writing continued-in.
const SWITCH_TIMEOUT_MS = 60_000
// Lets a waiting session take the lock between two messages of a busy one.
const YIELD_MS = 300

// Never log message text: transcripts can hold tool output and secrets.
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`)

let sessionId = process.argv[2] ?? ""
const initial = readState(sessionId)
if (!initial) {
  log(`no state for session ${sessionId}`)
  process.exit(1)
}
let state: SessionState = initial

const adapter = state.agent === "claude" ? new ClaudeAdapter() : new CodexAdapter()
const profile = new SayReadingProfile(loadDictionaries())
const synth = new Synthesizer(voiceConfigFromEnv(), sessionId)
const lock = new PlayLock(playLockPath(), waitingDir(), sessionId)
const cwd = state.cwd
let stopped = false

// ---- project name, spoken when the speaker changes ----

let nameAudio: { text: string; file: Promise<string> } | null = null

function projectName(): string {
  const base = path.basename(cwd)
  const clash = liveSessions().some((s) => s.sessionId !== sessionId && path.basename(s.cwd) === base && s.cwd !== cwd)
  return clash ? `${path.basename(path.dirname(cwd))} ${base}` : base
}

function nameFile(): Promise<string> {
  const text = `${cleanup(projectName())}。`
  if (nameAudio?.text !== text) nameAudio = { text, file: synth.render(profile.toSegments(text)) }
  return nameAudio.file
}

// ---- speech queue ----

const queue: string[] = []
let abort = new AbortController()
let wake: (() => void) | null = null
let releasedAt = 0

function enqueue(text: string) {
  if (!text.trim()) return
  queue.push(text)
  wake?.()
}

function interrupt() {
  queue.length = 0
  abort.abort()
  abort = new AbortController()
}

async function speaker() {
  while (!stopped) {
    const text = queue.shift()
    if (text === undefined) {
      await new Promise<void>((r) => (wake = r))
      wake = null
      continue
    }
    await speak(text, abort.signal).catch((e) => {
      if (!(e instanceof AbortedError)) log(`speak failed: ${e?.stack ?? e}`)
    })
  }
}

async function speak(text: string, signal: AbortSignal) {
  const chunks = chunkSentences(text)
  const files: string[] = []
  const render = (i: number) => {
    const p = synth.render(profile.toSegments(chunks[i]), signal)
    p.then((f) => files.push(f), () => {})
    return p
  }
  let next: Promise<string> | null = render(0)
  try {
    if (Date.now() - releasedAt < YIELD_MS && lock.othersWaiting()) await Bun.sleep(YIELD_MS)
    await lock.acquire(signal)
    try {
      if (readQuiet(lastSpeakerPath()) !== sessionId) {
        const name = await nameFile().catch((e) => {
          nameAudio = null
          log(`project name synthesis failed: ${e}`)
          return null
        })
        if (name) await play(name, signal)
        if (!signal.aborted) fs.writeFileSync(lastSpeakerPath(), sessionId)
      }
      for (let i = 0; i < chunks.length && next && !signal.aborted; i++) {
        const file: string = await next
        next = i + 1 < chunks.length ? render(i + 1) : null
        log(`speak: chunk ${i + 1}/${chunks.length}, ${chunks[i].length} chars`)
        await play(file, signal)
      }
    } finally {
      lock.release()
      releasedAt = Date.now()
    }
  } finally {
    await next?.catch(() => {})
    for (const f of files) fs.rmSync(f, { force: true })
  }
}

function handle(ev: AgentEvent) {
  switch (ev.type) {
    case "message":
      return enqueue(messageToSpeech(ev.text, ev.kind))
    case "question":
      return enqueue(questionToSpeech(ev.texts))
    case "interrupt":
      return interrupt()
    case "continuedIn":
      switchTo = { id: ev.sessionId, since: Date.now() }
      return
  }
}

// ---- transcript tail ----

const decoder = new TextDecoder()
let fd = fs.openSync(state.transcript, "r")
let offset = state.offset
let partial = ""
// Started in the middle of a line: drop it rather than parse half of it.
let skipToNewline = offset > 0 && byteAt(fd, offset - 1) !== 0x0a
let switchTo: { id: string; since: number } | null = null

function byteAt(f: number, pos: number): number {
  const b = Buffer.alloc(1)
  fs.readSync(f, b, 0, 1, pos)
  return b[0]
}

function readNew() {
  if (stopped) return
  if (switchTo) return trySwitch()
  const size = fs.fstatSync(fd).size
  if (size < offset) offset = 0
  while (offset < size) {
    const buf = Buffer.alloc(Math.min(size - offset, 1 << 20))
    const n = fs.readSync(fd, buf, 0, buf.length, offset)
    if (n <= 0) break
    offset += n
    partial += decoder.decode(buf.subarray(0, n), { stream: true })
  }
  const lines = partial.split("\n")
  partial = lines.pop() ?? ""
  if (skipToNewline && lines.length) {
    lines.shift()
    skipToNewline = false
  }
  for (const line of lines) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      log(`skip unparsable line (${line.length} chars)`)
      continue
    }
    for (const ev of adapter.push(parsed, Date.now())) handle(ev)
    if (switchTo) return trySwitch()
  }
  for (const ev of adapter.flush(Date.now())) handle(ev)
}

// The continued transcript starts with a copy of the history under the new session ID, so read it from its end.
function trySwitch() {
  const target = switchTo!
  if (!/^[A-Za-z0-9-]{8,128}$/.test(target.id)) {
    switchTo = null
    return log("ignored continued-in with an unexpected session id")
  }
  const file = path.join(path.dirname(state.transcript), `${target.id}.jsonl`)
  if (!fs.existsSync(file)) {
    if (Date.now() - target.since > SWITCH_TIMEOUT_MS) shutdown(`continued transcript ${target.id} never appeared`)
    return
  }
  log(`session continued in ${target.id}`)
  switchTo = null
  fs.closeSync(fd)
  fd = fs.openSync(file, "r")
  offset = fs.fstatSync(fd).size
  partial = ""
  skipToNewline = offset > 0 && byteAt(fd, offset - 1) !== 0x0a
  // `off` and `status` in the continued session look the state up by the new ID; re-read it for the watcher PID `on` wrote.
  const current = readState(sessionId) ?? state
  removeState(sessionId)
  sessionId = target.id
  state = { ...current, sessionId: target.id, transcript: file, offset }
  writeState(state)
}

// ---- lifecycle ----

function shutdown(reason: string) {
  if (stopped) return
  stopped = true
  log(`stopping: ${reason}`)
  abort.abort()
  lock.abandon()
  synth.dispose()
  if (readState(sessionId)?.watcherProc?.pid === process.pid) removeState(sessionId)
  process.exit(0)
}

function checkLiveness() {
  if (!isAlive(state.agentProc)) return shutdown(`agent ${state.agentProc.pid} exited`)
  // `on` records our PID right after spawning us; anything else means we were replaced or turned off.
  const current = readState(sessionId)
  if (!current) return shutdown("state file removed")
  if (current.watcherProc && current.watcherProc.pid !== process.pid) return shutdown(`replaced by ${current.watcherProc.pid}`)
  // stdout is appended to this file, so truncating in place keeps writing at the new end.
  const log = sessionLogPath(sessionId)
  if ((fs.statSync(log, { throwIfNoEntry: false })?.size ?? 0) > LOG_MAX_BYTES) fs.truncateSync(log, 0)
}

function readQuiet(file: string): string {
  try {
    return fs.readFileSync(file, "utf8").trim()
  } catch {
    return ""
  }
}

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) process.on(sig, () => shutdown(sig))
process.on("uncaughtException", (e) => log(`uncaught: ${e.stack ?? e}`))
process.on("unhandledRejection", (e) => log(`unhandled: ${(e as Error)?.stack ?? e}`))

log(`started for ${state.agent} session ${sessionId}, agent pid ${state.agentProc.pid}, watcher ${procRef(process.pid)?.pid}`)
nameFile().catch(() => (nameAudio = null))
fs.watch(path.dirname(state.transcript), () => readNew())
setInterval(readNew, TAIL_POLL_MS)
setInterval(checkLiveness, LIVENESS_POLL_MS)
readNew()
speaker()
