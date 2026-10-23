import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export type AgentKind = "claude" | "codex"

export interface AgentInfo {
  kind: AgentKind
  sessionId: string
  agentPid: number | null
}

// Session IDs become file names.
const SAFE_ID = /^[A-Za-z0-9-]{8,128}$/

// Codex first: a Codex started from Claude Code inherits the CLAUDE* variables as well.
export function detectAgent(env: NodeJS.ProcessEnv = process.env): AgentInfo | null {
  if (env.CODEX_THREAD_ID) {
    return { kind: "codex", sessionId: checkId(env.CODEX_THREAD_ID), agentPid: findAncestor("codex") }
  }
  if (env.CLAUDECODE === "1" && env.CLAUDE_CODE_SESSION_ID) {
    const pid = Number(env.CLAUDE_PID)
    return { kind: "claude", sessionId: checkId(env.CLAUDE_CODE_SESSION_ID), agentPid: Number.isInteger(pid) && pid > 1 ? pid : null }
  }
  return null
}

function checkId(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`unexpected session id: ${id}`)
  return id
}

// Codex exposes no PID variable, so walk up the process tree.
export function findAncestor(name: string, start = process.ppid): number | null {
  let pid = start
  for (let i = 0; i < 32 && pid > 1; i++) {
    const r = Bun.spawnSync(["ps", "-o", "ppid=,comm=", "-p", String(pid)])
    if (r.exitCode !== 0) return null
    const m = r.stdout.toString().trim().match(/^(\d+)\s+(.+)$/)
    if (!m) return null
    if (path.basename(m[2]) === name) return pid
    pid = Number(m[1])
  }
  return null
}

export function findTranscript(kind: AgentKind, sessionId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const home = os.homedir()
  const [root, pattern] =
    kind === "claude"
      ? [env.CLAUDE_CONFIG_DIR ?? path.join(home, ".claude"), `projects/*/${sessionId}.jsonl`]
      : [env.CODEX_HOME ?? path.join(home, ".codex"), `sessions/*/*/*/rollout-*-${sessionId}.jsonl`]
  if (!fs.existsSync(root)) return null
  let found: string | null = null
  let newest = -1
  for (const rel of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
    const p = path.join(root, rel)
    const mtime = fs.statSync(p).mtimeMs
    if (mtime > newest) [found, newest] = [p, mtime]
  }
  return found
}

// Where the session started: later lines follow every `cd`, which would name the project after a subdirectory.
export function transcriptCwd(kind: AgentKind, transcript: string): string | null {
  const len = Math.min(fs.statSync(transcript).size, 256 * 1024)
  const buf = Buffer.alloc(len)
  const fd = fs.openSync(transcript, "r")
  try {
    fs.readSync(fd, buf, 0, len, 0)
  } finally {
    fs.closeSync(fd)
  }
  for (const line of buf.toString("utf8").split("\n")) {
    try {
      const o = JSON.parse(line)
      const cwd = kind === "claude" ? o.cwd : o.type === "session_meta" || o.type === "turn_context" ? o.payload?.cwd : undefined
      if (typeof cwd === "string") return cwd
    } catch {}
  }
  return null
}
