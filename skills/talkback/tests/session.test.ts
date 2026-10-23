// End to end: the CLI starts a real watcher that tails a transcript; fake say and afplay record what is heard.
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { appendLines, baseEnv, claude, CLI, runCli, spoken, tempHome, waitFor } from "./helpers"

const SID = "11111111-2222-3333-4444-555555555555"
const children: Bun.Subprocess[] = []
afterEach(() => children.splice(0).forEach((c) => c.kill("SIGKILL")))

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const stateDir = (home: string) => path.join(home, ".local", "state", "talkback")
const watcherPid = (home: string, sid = SID) => JSON.parse(fs.readFileSync(path.join(stateDir(home), "sessions", `${sid}.json`), "utf8")).watcherProc.pid as number

// lastSpeaker: who spoke before this session; pass SID to skip the project name announcement.
function claudeSession(opts: { lastSpeaker?: string; afplaySeconds?: number; home?: string; sid?: string; agent?: Bun.Subprocess } = {}) {
  const home = opts.home ?? tempHome()
  const sid = opts.sid ?? SID
  const transcript = path.join(home, ".claude", "projects", "-work-proj", `${sid}.jsonl`)
  fs.mkdirSync(path.dirname(transcript), { recursive: true })
  // The later line has moved into a subdirectory; the project is still named after where the session started.
  appendLines(transcript, [claude.text("old", "履歴の返答。", "end_turn"), claude.text("old2", "履歴。", "end_turn", "/work/proj/docs")])
  const agent = opts.agent ?? Bun.spawn(["sleep", "60"])
  children.push(agent)
  fs.mkdirSync(stateDir(home), { recursive: true })
  if (opts.lastSpeaker) fs.writeFileSync(path.join(stateDir(home), "last-speaker"), opts.lastSpeaker)
  const env = baseEnv(home, { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: sid, CLAUDE_PID: String(agent.pid), AFPLAY_SECONDS: String(opts.afplaySeconds ?? 0) })
  const stateFile = path.join(stateDir(home), "sessions", `${sid}.json`)
  return { home, transcript, agent, env, stateFile }
}

describe("Claude Code session", () => {
  test("on → speaks new messages only, names the project first → status → off", async () => {
    const s = claudeSession()
    const on = runCli(["on"], s.env)
    expect(on.code).toBe(0)
    expect(on.stdout).toContain("ON にしました")
    expect(runCli(["on"], s.env).stdout).toContain("すでに ON")

    appendLines(s.transcript, [
      claude.text("m1", "調べます。詳しく見ます。", "tool_use"),
      claude.tool("m1", "Bash"),
      claude.toolResult(),
      claude.text("m2", "`useEffect` を直しました。", "end_turn"),
    ])
    await waitFor(() => spoken(s.home).length >= 3, 15000, "three utterances")
    // The project name has no katakana reading, so it goes to the English voice.
    expect(spoken(s.home)).toEqual(["proj。", "調べます。\n詳しく見ます。", "ユーズエフェクト を直しました。"])

    expect(runCli(["status"], s.env).stdout).toContain("このセッション: ON")
    const pid = watcherPid(s.home)
    expect(runCli(["off"], s.env).stdout).toContain("OFF にしました")
    expect(isAlive(pid)).toBe(false)
    expect(fs.existsSync(s.stateFile)).toBe(false)
  }, 30000)

  test("a typed prompt stops the current utterance and drops queued ones", async () => {
    const s = claudeSession({ lastSpeaker: SID, afplaySeconds: 3 })
    expect(runCli(["on"], s.env).code).toBe(0)
    const long = Array.from({ length: 9 }, (_, i) => `これは長い返答の ${i + 1} 文目です。`).join("")
    appendLines(s.transcript, [claude.text("m1", long, "end_turn"), claude.text("m2", "あとの返答。", "end_turn")])
    await waitFor(() => spoken(s.home).length >= 1, 15000, "first chunk")
    appendLines(s.transcript, [claude.user("止めて")])
    await Bun.sleep(4000)
    expect(spoken(s.home)).toHaveLength(1)
  }, 30000)

  // Regression: task notifications are user lines too, and used to cut the reply being read short.
  test("a harness-injected user line during speech does not interrupt", async () => {
    const s = claudeSession({ lastSpeaker: SID, afplaySeconds: 1 })
    expect(runCli(["on"], s.env).code).toBe(0)
    const long = Array.from({ length: 7 }, (_, i) => `${i + 1} 文目です。`).join("")
    appendLines(s.transcript, [claude.text("m1", long, "end_turn")])
    await waitFor(() => spoken(s.home).length >= 1, 15000, "first chunk")
    appendLines(s.transcript, [claude.user("<task-notification>done</task-notification>")])
    await waitFor(() => spoken(s.home).length >= 3, 15000, "all three chunks")
  }, 30000)

  test("the watcher exits and cleans up when the agent process exits", async () => {
    const s = claudeSession()
    expect(runCli(["on"], s.env).code).toBe(0)
    const pid = watcherPid(s.home)
    s.agent.kill("SIGKILL")
    await waitFor(() => !isAlive(pid), 8000, "watcher exit")
    expect(fs.existsSync(s.stateFile)).toBe(false)
  }, 15000)

  test("on in a cleared session stops the watcher left by the old session ID", async () => {
    const first = claudeSession()
    expect(runCli(["on"], first.env).code).toBe(0)
    const oldPid = watcherPid(first.home)
    const NEW = "99999999-2222-3333-4444-555555555555"
    const second = claudeSession({ home: first.home, sid: NEW, agent: first.agent })
    expect(runCli(["on"], second.env).code).toBe(0)
    expect(isAlive(oldPid)).toBe(false)
    expect(fs.existsSync(first.stateFile)).toBe(false)
    expect(isAlive(watcherPid(first.home, NEW))).toBe(true)
  }, 30000)

  // Real transcripts: the new file appears seconds after continued-in and starts with the history copied under the new ID.
  test("follows a resumed session into its new transcript, skipping the copied history", async () => {
    const s = claudeSession({ lastSpeaker: SID })
    expect(runCli(["on"], s.env).code).toBe(0)
    const NEW = "88888888-2222-3333-4444-555555555555"
    const next = path.join(path.dirname(s.transcript), `${NEW}.jsonl`)
    appendLines(s.transcript, [{ type: "continued-in", sessionId: SID, continuedInSessionId: NEW }])
    await Bun.sleep(1500)
    appendLines(next, [{ ...claude.text("old", "コピーされた履歴。", "end_turn"), sessionId: NEW }, { ...claude.user("前の質問", { origin: { kind: "human" } }), sessionId: NEW }])
    await waitFor(() => fs.existsSync(path.join(stateDir(s.home), "sessions", `${NEW}.json`)), 8000, "state moved")
    fs.writeFileSync(path.join(stateDir(s.home), "last-speaker"), NEW)
    appendLines(next, [{ ...claude.text("m1", "続きの返答。", "end_turn"), sessionId: NEW }])
    await waitFor(() => spoken(s.home).length >= 1, 15000, "utterance")
    expect(spoken(s.home)).toEqual(["続きの返答。"])
    expect(runCli(["off"], { ...s.env, CLAUDE_CODE_SESSION_ID: NEW }).stdout).toContain("OFF にしました")
  }, 30000)
})

describe("Codex session", () => {
  function codexSession() {
    const home = tempHome()
    const rollout = path.join(home, ".codex", "sessions", "2026", "10", "23", `rollout-2026-10-23T00-00-00-${SID}.jsonl`)
    fs.mkdirSync(path.dirname(rollout), { recursive: true })
    appendLines(rollout, [{ type: "session_meta", payload: { cwd: "/work/app" } }])
    // The CLI finds the Codex process by name among its ancestors.
    const fakeCodex = path.join(home, "codex")
    fs.symlinkSync("/bin/sh", fakeCodex)
    fs.mkdirSync(stateDir(home), { recursive: true })
    fs.writeFileSync(path.join(stateDir(home), "last-speaker"), SID)
    // Claude Code variables leak into a Codex started from Claude Code; Codex must still win.
    const env = baseEnv(home, { CODEX_THREAD_ID: SID, CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "00000000-0000-0000-0000-000000000000", CLAUDE_PID: "1" })
    return { home, rollout, fakeCodex, env }
  }

  test("finds the Codex process, speaks commentary and the final answer, and exits with Codex", async () => {
    const s = codexSession()
    fs.mkdirSync(s.env.TMPDIR, { recursive: true })
    const out = path.join(s.home, "on.out")
    const codex = Bun.spawn([s.fakeCodex, "-c", `"${process.execPath}" "${CLI}" on > "${out}" 2>&1; sleep 60`], { env: s.env, cwd: s.home })
    children.push(codex)
    await waitFor(() => fs.existsSync(out) && fs.readFileSync(out, "utf8").includes("ON にしました"), 10000, "on")

    const agentMsg = (message: string, phase: string) => ({ type: "event_msg", payload: { type: "agent_message", message, phase } })
    appendLines(s.rollout, [
      agentMsg("確認します。そのあと直します。", "commentary"),
      { type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: "{}" } },
      agentMsg("直しました。", "final_answer"),
    ])
    await waitFor(() => spoken(s.home).length >= 2, 15000, "two utterances")
    expect(spoken(s.home)).toEqual(["確認します。\nそのあと直します。", "直しました。"])

    const pid = watcherPid(s.home)
    codex.kill("SIGKILL")
    await waitFor(() => !isAlive(pid), 8000, "watcher exit")
  }, 30000)

  test("inside the sandbox, on prints the execution rule and exits 2", () => {
    const s = codexSession()
    // A file where the state directory should be makes it unwritable, as the sandbox does.
    fs.rmSync(path.join(s.home, ".local"), { recursive: true })
    fs.mkdirSync(path.join(s.home, ".local"), { recursive: true })
    fs.writeFileSync(path.join(s.home, ".local", "state"), "")
    const r = runCli(["on"], s.env)
    expect(r.code).toBe(2)
    expect(r.stderr).toContain("prefix_rule(")
    expect(r.stderr).toContain(JSON.stringify(CLI))
    expect(r.stderr).toContain(path.join(s.home, ".codex", "rules", "talkback.rules"))
  })
})
