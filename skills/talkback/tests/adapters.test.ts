import { describe, expect, test } from "bun:test"
import { ClaudeAdapter } from "../scripts/lib/adapters/claude"
import { CodexAdapter } from "../scripts/lib/adapters/codex"
import { PENDING_TIMEOUT_MS, type Adapter, type AgentEvent } from "../scripts/lib/adapters/types"
import { claude } from "./helpers"

function feed(adapter: Adapter, lines: unknown[], now = 0): AgentEvent[] {
  return lines.flatMap((l) => adapter.push(l, now))
}

describe("Claude Code transcript", () => {
  test("text before an ordinary tool call is intermediate, the end_turn text is final", () => {
    const a = new ClaudeAdapter()
    expect(feed(a, [claude.text("m1", "調べます。", "tool_use"), claude.tool("m1", "Bash"), claude.toolResult(), claude.text("m2", "終わりました。", "end_turn")])).toEqual([
      { type: "message", text: "調べます。", kind: "intermediate" },
      { type: "message", text: "終わりました。", kind: "final" },
    ])
  })

  test("text before AskUserQuestion is final and the questions follow", () => {
    const a = new ClaudeAdapter()
    const input = { questions: [{ question: "どれにしますか？", options: [{ label: "A" }] }] }
    expect(feed(a, [claude.text("m1", "論点です。", "tool_use"), claude.tool("m1", "AskUserQuestion", input)])).toEqual([
      { type: "message", text: "論点です。", kind: "final" },
      { type: "question", texts: ["どれにしますか？"] },
    ])
  })

  test("held text is released as intermediate when no tool call follows in time", () => {
    const a = new ClaudeAdapter()
    expect(feed(a, [claude.text("m1", "調べます。", "tool_use")])).toEqual([])
    expect(a.flush(PENDING_TIMEOUT_MS - 1)).toEqual([])
    expect(a.flush(PENDING_TIMEOUT_MS)).toEqual([{ type: "message", text: "調べます。", kind: "intermediate" }])
  })

  test("stop reasons other than tool_use are final", () => {
    expect(feed(new ClaudeAdapter(), [claude.text("m1", "途中で切れた", "max_tokens")])).toEqual([{ type: "message", text: "途中で切れた", kind: "final" }])
  })

  test.each([
    ["a tool result", claude.toolResult(), false],
    ["a harness line marked isMeta", claude.user("skill body", { isMeta: true }), false],
    ["a task notification in the old format", claude.user("<task-notification>done</task-notification>"), false],
    ["a prompt typed in the old format", claude.user("次へ"), true],
    ["a line from another session", claude.user("hello", { origin: { kind: "peer" } }), false],
    ["a line the user wrote", claude.user("<b>太字</b>で", { origin: { kind: "human" } }), true],
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

  test("commentary before a tool call is intermediate, final_answer is final, response_item messages are not repeated", () => {
    const a = new CodexAdapter()
    const dup = { type: "response_item", payload: { type: "message", role: "assistant", content: [] } }
    expect(feed(a, [agent("調べます。", "commentary"), dup, call("exec_command"), agent("終わりました。", "final_answer"), dup])).toEqual([
      { type: "message", text: "調べます。", kind: "intermediate" },
      { type: "message", text: "終わりました。", kind: "final" },
    ])
  })

  test("commentary before request_user_input is final and the questions follow", () => {
    const a = new CodexAdapter()
    expect(feed(a, [agent("確認させてください。", "commentary"), call("request_user_input", { questions: [{ id: "q", question: "進めますか？" }] })])).toEqual([
      { type: "message", text: "確認させてください。", kind: "final" },
      { type: "question", texts: ["進めますか？"] },
    ])
  })

  // Codex Desktop writes no phase; only the message right before task_complete is the final answer.
  test("without phase, the message before task_complete is final and earlier ones are intermediate", () => {
    const a = new CodexAdapter()
    const complete = { type: "event_msg", payload: { type: "task_complete" } }
    expect(feed(a, [agent("調べます。"), agent("直しました。")], 0)).toEqual([{ type: "message", text: "調べます。", kind: "intermediate" }])
    expect(a.flush(60_000)).toEqual([])
    expect(feed(a, [complete])).toEqual([{ type: "message", text: "直しました。", kind: "final" }])
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
