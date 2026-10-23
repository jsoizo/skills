import { describe, expect, test } from "bun:test"
import { ClaudeAdapter } from "../scripts/lib/adapters/claude"
import { CodexAdapter } from "../scripts/lib/adapters/codex"
import type { Adapter, AgentEvent } from "../scripts/lib/adapters/types"
import { claude } from "./helpers"

function feed(adapter: Adapter, lines: unknown[]): AgentEvent[] {
  return lines.flatMap((l) => adapter.push(l))
}

describe("Claude Code transcript", () => {
  test("text blocks are messages as soon as they arrive, whatever follows; tool calls and results are silent", () => {
    const a = new ClaudeAdapter()
    expect(feed(a, [claude.text("m1", "調べます。", "tool_use"), claude.tool("m1", "Bash"), claude.toolResult(), claude.text("m2", "終わりました。", "end_turn")])).toEqual([
      { type: "message", text: "調べます。" },
      { type: "message", text: "終わりました。" },
    ])
  })

  test("AskUserQuestion is read as its question texts, without the options", () => {
    const input = { questions: [{ question: "どれにしますか？", options: [{ label: "A" }] }] }
    expect(feed(new ClaudeAdapter(), [claude.text("m1", "論点です。", "tool_use"), claude.tool("m1", "AskUserQuestion", input)])).toEqual([
      { type: "message", text: "論点です。" },
      { type: "question", texts: ["どれにしますか？"] },
    ])
  })

  test.each([
    ["a tool result", claude.toolResult(), false],
    ["a harness line marked isMeta", claude.user("skill body", { isMeta: true }), false],
    ["a task notification in the old format", claude.user("<task-notification>done</task-notification>"), false],
    ["a prompt typed in the old format", claude.user("次へ"), true],
    ["a line from another session", claude.user("hello", { origin: { kind: "peer" } }), false],
    ["a line the user wrote", claude.user("<b>太字</b>で", { origin: { kind: "human" } }), true],
    // Regression: running `!code .` cut off the reply being read.
    ["a shell command run with !", claude.user("<bash-input>code .</bash-input><bash-stdout></bash-stdout>", { origin: { kind: "human" }, promptSource: "sdk" }), false],
    ["local command output", claude.user("<local-command-stdout>Set model</local-command-stdout>", { origin: { kind: "human" } }), false],
    ["a slash command the user typed", claude.user("<command-message>review</command-message>\n<command-name>/review</command-name>", { origin: { kind: "human" } }), true],
    ["a queued prompt", claude.user("次へ", { promptSource: "queued" }), true],
    ["an automatic continuation", claude.user("続けて", { promptSource: "auto-continuation" }), false],
    ["an Esc interruption", { type: "user", message: { role: "user", content: [{ type: "text", text: "[Request interrupted by user]" }] } }, true],
    ["a prompt queued while the agent works", { type: "attachment", attachment: { type: "queued_command", commandMode: "prompt", origin: { kind: "human" } } }, true],
    ["a subagent report queued for the agent", { type: "attachment", attachment: { type: "queued_command", commandMode: "prompt", origin: { kind: "peer" } } }, false],
  ])("interrupts on %s: %p", (_name, line, interrupts) => {
    expect(feed(new ClaudeAdapter(), [line])).toEqual(interrupts ? [{ type: "interrupt" }] : [])
  })

  test("a continued-in line names the session that takes over", () => {
    expect(feed(new ClaudeAdapter(), [{ type: "continued-in", sessionId: "a", continuedInSessionId: "b" }])).toEqual([{ type: "continuedIn", sessionId: "b" }])
  })

  test("subagent lines are ignored", () => {
    expect(feed(new ClaudeAdapter(), [{ ...claude.text("m1", "subagent", "end_turn"), isSidechain: true }])).toEqual([])
  })

})

describe("Codex rollout", () => {
  const agent = (message: string, phase?: string) => ({ type: "event_msg", payload: { type: "agent_message", message, ...(phase ? { phase } : {}) } })
  const call = (name: string, args: unknown = {}) => ({ type: "response_item", payload: { type: "function_call", name, arguments: JSON.stringify(args) } })

  // Codex Desktop writes no phase, so phase must not decide whether a message is read.
  test("agent messages are read with or without phase, and response_item copies are not repeated", () => {
    const dup = { type: "response_item", payload: { type: "message", role: "assistant", content: [] } }
    expect(feed(new CodexAdapter(), [agent("調べます。", "commentary"), dup, call("exec_command"), agent("直しました。"), dup, agent("終わりました。", "final_answer")])).toEqual([
      { type: "message", text: "調べます。" },
      { type: "message", text: "直しました。" },
      { type: "message", text: "終わりました。" },
    ])
  })

  test("request_user_input is read as its question texts", () => {
    expect(feed(new CodexAdapter(), [agent("確認させてください。", "commentary"), call("request_user_input", { questions: [{ id: "q", question: "進めますか？" }] })])).toEqual([
      { type: "message", text: "確認させてください。" },
      { type: "question", texts: ["進めますか？"] },
    ])
  })

  const event = (payload: unknown) => ({ type: "event_msg", payload })
  test.each([
    ["a typed message", event({ type: "user_message", message: "次" }), true],
    ["an injected notification", event({ type: "user_message", message: "<task-notification>x</task-notification>" }), false],
    ["an aborted turn", event({ type: "turn_aborted" }), true],
  ])("interrupts on %s: %p", (_name, line, interrupts) => {
    expect(feed(new CodexAdapter(), [line])).toEqual(interrupts ? [{ type: "interrupt" }] : [])
  })

})
