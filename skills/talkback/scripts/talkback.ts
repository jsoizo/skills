#!/usr/bin/env bun
// Turns spoken replies on or off for the current Claude Code or Codex session.
// Usage: bun talkback.ts on | off | status | doctor
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { detectAgent, findTranscript, transcriptCwd, type AgentInfo } from "./lib/agent"
import { logsDir, sessionLogPath, sessionsDir, stateDir, waitingDir, WATCHER_PATH } from "./lib/paths"
import { commandLine, isAlive, killGroup, procRef, type ProcRef } from "./lib/proc"
import { loadDictionaries } from "./lib/reading"
import { allStates, liveSessions, readState, removeState, watcherAlive, writeState, type SessionState } from "./lib/state"

const EXIT_ERROR = 1
const EXIT_PREREQ = 2
const LOG_MAX_BYTES = 1024 * 1024

const print = (msg: string) => console.log(`talkback: ${msg}`)

function fail(code: number, msg: string): never {
  console.error(`talkback: ${msg}`)
  process.exit(code)
}

function requireAgent(): AgentInfo {
  const agent = detectAgent()
  if (!agent) fail(EXIT_PREREQ, "Claude Code か Codex のセッションの中で実行してください（CLAUDE_CODE_SESSION_ID も CODEX_THREAD_ID も見つかりません）。")
  return agent
}

function stateWritable(): boolean {
  try {
    // A recursive mkdir applies the mode to the last directory only.
    for (const d of [stateDir(), logsDir(), sessionsDir(), waitingDir()]) {
      fs.mkdirSync(d, { recursive: true })
      fs.chmodSync(d, 0o700)
    }
    const probe = path.join(stateDir(), `.probe-${process.pid}`)
    fs.writeFileSync(probe, "")
    fs.rmSync(probe)
    return true
  } catch {
    return false
  }
}

// Inside a sandbox the state directory may be read-only, or `ps` may be denied so the agent cannot be watched.
function agentProcOutsideSandbox(agent: AgentInfo): ProcRef | null {
  if (!stateWritable() || !agent.agentPid) return null
  return procRef(agent.agentPid)
}

// ---- Codex execution rule ----

const codexHome = () => process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex")
const codexRulesDir = () => path.join(codexHome(), "rules")
const codexRuleFile = () => path.join(codexRulesDir(), "talkback.rules")

// The model may run the CLI through a symlinked skill directory or its real path; a rule matches only the exact token.
function cliPaths(): string[] {
  const invoked = path.resolve(process.argv[1])
  let real = invoked
  try {
    real = fs.realpathSync(invoked)
  } catch {}
  return [...new Set([invoked, real])]
}

export function codexRuleText(): string {
  return cliPaths()
    .map(
      (p) => `prefix_rule(
    pattern = ["bun", ${JSON.stringify(p)}],
    decision = "allow",
    justification = "talkback: 読み上げの監視プロセスを sandbox の外で起動・停止する",
)
`,
    )
    .join("\n")
}

// true: a rule allows it, false: no rule, null: could not check.
function codexRuleAllows(): boolean | null {
  const dir = codexRulesDir()
  try {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".rules")).map((f) => path.join(dir, f)) : []
    if (!files.length) return false
    const r = Bun.spawnSync(["codex", "execpolicy", "check", ...files.flatMap((f) => ["--rules", f]), "bun", path.resolve(process.argv[1]), "on"], { stderr: "ignore" })
    if (r.exitCode !== 0) return null
    return JSON.parse(r.stdout.toString()).decision === "allow"
  } catch {
    return null
  }
}

function sandboxHelp(agent: AgentInfo, action: "on" | "off"): never {
  const what = action === "on" ? "読み上げを開始できません" : "読み上げを止められません"
  if (agent.kind === "claude") {
    fail(
      EXIT_PREREQ,
      [
        `sandbox の中で実行されたため、${what}（${stateDir()} に書き込めないか、Claude Code のプロセスを確認できません）。`,
        "Claude Code の Bash の sandbox を使っている場合は、talkback.ts を sandbox の対象から外してください（settings.json の sandbox.excludedCommands など）。",
      ].join("\n"),
    )
  }
  const allows = codexRuleAllows()
  const lines =
    allows === true
      ? [
          "sandbox の中で実行されました。実行ルールはありますが、コマンドの形がルールに一致していません。",
          `\`bash -lc\` などで包まず、次の形でそのまま実行してください: bun ${path.resolve(process.argv[1])} ${action}`,
        ]
      : [
          `sandbox の中で実行されたため、${what}（sandbox の中からは監視プロセスと Codex のプロセスを確認できないため）。`,
          `次の実行ルールを ${codexRuleFile()} に追加すると、承認なしで sandbox の外で実行されます。`,
          "",
          codexRuleText(),
          "ルールを追加しない場合は、1 回限りの権限昇格（sandbox_permissions: \"require_escalated\"）で実行することもできます。",
        ]
  fail(EXIT_PREREQ, lines.join("\n"))
}

// ---- watcher processes ----

// Guards `off` against a recycled PID. The session ID is not checked: after a resume the watcher keeps its launch ID.
function isOurWatcher(s: SessionState): boolean {
  if (!s.watcherProc || !isAlive(s.watcherProc)) return false
  return commandLine(s.watcherProc.pid).includes(path.basename(WATCHER_PATH))
}

async function stopWatcher(s: SessionState): Promise<void> {
  if (isOurWatcher(s)) {
    killGroup(s.watcherProc!, "SIGTERM")
    for (let i = 0; i < 30 && isAlive(s.watcherProc!); i++) await Bun.sleep(100)
    if (isAlive(s.watcherProc!)) killGroup(s.watcherProc!, "SIGKILL")
  }
  removeState(s.sessionId)
}

const sameProc = (a: ProcRef, b: ProcRef) => a.pid === b.pid && a.start === b.start

function openLog(sessionId: string): number {
  const file = sessionLogPath(sessionId)
  if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > LOG_MAX_BYTES) fs.truncateSync(file, 0)
  return fs.openSync(file, "a", 0o600)
}

// ---- subcommands ----

async function on() {
  const agent = requireAgent()
  const agentProc = agentProcOutsideSandbox(agent)
  if (!agentProc) {
    if (!stateWritable() || agent.kind === "codex") sandboxHelp(agent, "on")
    fail(EXIT_PREREQ, "エージェントのプロセスを特定できないため、開始しません（監視プロセスが終了できなくなるため）。")
  }

  if (watcherAlive(readState(agent.sessionId))) {
    print("このセッションの読み上げはすでに ON です。")
    return
  }
  // Claude Code: the same process under another session ID means /clear, so that watcher is stale.
  // Not Codex: one app process may serve several live threads.
  for (const s of allStates()) {
    if (agent.kind === "claude" && s.sessionId !== agent.sessionId && s.agentProc && sameProc(s.agentProc, agentProc)) await stopWatcher(s)
  }

  let transcript: string | null = null
  for (let i = 0; i < 10 && !transcript; i++) {
    transcript = findTranscript(agent.kind, agent.sessionId)
    if (!transcript) await Bun.sleep(300)
  }
  if (!transcript) fail(EXIT_ERROR, `セッション ${agent.sessionId} の transcript が見つかりません。`)

  const state: SessionState = {
    sessionId: agent.sessionId,
    agent: agent.kind,
    agentProc,
    transcript,
    offset: fs.statSync(transcript).size,
    cwd: transcriptCwd(agent.kind, transcript) ?? process.cwd(),
    watcherProc: null,
    startedAt: new Date().toISOString(),
  }
  writeState(state)
  const logFd = openLog(agent.sessionId)
  const proc = Bun.spawn([process.execPath, WATCHER_PATH, agent.sessionId], {
    stdio: ["ignore", logFd, logFd],
    detached: true,
    env: process.env,
  })
  proc.unref()
  fs.closeSync(logFd)
  const watcherProc = procRef(proc.pid)
  writeState({ ...state, watcherProc })

  await Bun.sleep(300)
  if (!watcherProc || !isAlive(watcherProc)) {
    removeState(agent.sessionId)
    fail(EXIT_ERROR, `監視プロセスがすぐに終了しました。ログ: ${sessionLogPath(agent.sessionId)}`)
  }
  print("このセッションの読み上げを ON にしました。")
  // Reaching here inside Codex without a rule means a one-time escalation was approved.
  if (agent.kind === "codex" && codexRuleAllows() === false) {
    print(`次回から承認なしで切り替えるには、${codexRuleFile()} に次のルールを追加してください。\n${codexRuleText()}`)
  }
}

async function off() {
  const agent = requireAgent()
  // Inside a sandbox every process looks dead, which would drop the state of a watcher that is still talking.
  if (!agentProcOutsideSandbox(agent)) sandboxHelp(agent, "off")
  const state = readState(agent.sessionId)
  if (!state || !isOurWatcher(state)) {
    removeState(agent.sessionId)
    print("このセッションの読み上げはすでに OFF です。")
    return
  }
  try {
    await stopWatcher(state)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EPERM") sandboxHelp(agent, "off")
    throw e
  }
  print("このセッションの読み上げを OFF にしました。")
}

function status() {
  const agent = detectAgent()
  const sessions = liveSessions()
  const mine = agent && sessions.some((s) => s.sessionId === agent.sessionId)
  print(`このセッション: ${agent ? (mine ? "ON" : "OFF") : "不明（エージェントの外）"}。ON のセッション数: ${sessions.length}`)
}

function lastLineParses(file: string): boolean {
  const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n")
  try {
    JSON.parse(lines.at(-1) ?? "")
    return true
  } catch {
    return false
  }
}

function doctor() {
  const checks: [string, boolean, string?][] = []
  const has = (cmd: string) => Bun.spawnSync(["which", cmd]).exitCode === 0
  checks.push(["say", has("say"), "macOS の say が必要です"])
  checks.push(["afplay", has("afplay"), "macOS の afplay が必要です"])
  const voices = Bun.spawnSync(["say", "-v", "?"]).stdout.toString()
  for (const v of [process.env.TALKBACK_VOICE_JA || "Kyoko", process.env.TALKBACK_VOICE_EN || "Samantha"]) {
    const listed = voices.split("\n").some((l) => l.startsWith(`${v} `))
    checks.push([`音声 ${v}`, listed, "システム設定 > アクセシビリティ > 読み上げコンテンツ で音声を追加してください"])
  }
  checks.push([`Bun.markdown（Bun ${Bun.version}）`, typeof (Bun as any).markdown?.render === "function", "Bun を更新してください"])
  const dicts = loadDictionaries()
  checks.push([`辞書（上書き ${dicts.overrides.size} 語、kanalizer ${dicts.words.size} 語）`, dicts.words.size > 0 && dicts.overrides.size > 0])
  const agent = detectAgent()
  checks.push([`エージェント: ${agent ? `${agent.kind} ${agent.sessionId}` : "検出できません"}`, agent !== null, "CLAUDE_CODE_SESSION_ID / CLAUDE_PID / CODEX_THREAD_ID を確認してください"])
  if (agent) {
    const proc = agentProcOutsideSandbox(agent)
    checks.push([`エージェントのプロセス: ${proc ? proc.pid : "確認できません"}`, proc !== null, "sandbox の外で実行する必要があります"])
    const t = findTranscript(agent.kind, agent.sessionId)
    checks.push([`transcript: ${t ?? "見つかりません"}`, t !== null])
    if (t) checks.push(["transcript の最新の行を解析できる", lastLineParses(t), "transcript の形式が変わった可能性があります"])
  }
  checks.push([`状態ディレクトリ ${stateDir()} への書き込み`, stateWritable(), "sandbox の外で実行する必要があります"])
  if (agent?.kind === "codex") {
    const allows = codexRuleAllows()
    // Without the codex command (the desktop app) the rule cannot be checked, which is not a failure by itself.
    const label = allows === null ? "Codex の実行ルール（codex コマンドがないため確認できません）" : "Codex の実行ルール"
    checks.push([label, allows !== false, `次のルールを ${codexRuleFile()} に追加してください\n${codexRuleText()}`])
  }
  for (const [name, ok, hint] of checks) console.log(`${ok ? "✓" : "✗"} ${name}${!ok && hint ? `\n    ${hint.replace(/\n/g, "\n    ")}` : ""}`)
  if (checks.some(([, ok]) => !ok)) process.exit(EXIT_PREREQ)
}

const commands: Record<string, () => unknown> = { on, off, status, doctor }
const cmd = commands[process.argv[2] ?? ""]
if (!cmd) fail(EXIT_PREREQ, "usage: bun talkback.ts on | off | status | doctor")
await cmd()
