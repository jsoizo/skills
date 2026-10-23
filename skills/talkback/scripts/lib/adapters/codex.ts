import { isRecord, looksInjected, PendingText, questionTexts, type Adapter, type AgentEvent } from "./types"

const QUESTION_TOOLS = new Set(["request_user_input"])

export class CodexAdapter implements Adapter {
  private pending = new PendingText()

  push(line: unknown, now: number): AgentEvent[] {
    if (!isRecord(line) || !isRecord(line.payload)) return []
    const p = line.payload
    if (line.type === "event_msg") return this.event(p, now)
    // `message` items duplicate agent_message events; only tool calls matter here.
    if (line.type === "response_item" && typeof p.type === "string" && p.type.endsWith("_call")) return this.toolCall(p)
    return []
  }

  flush(now: number): AgentEvent[] {
    return this.pending.flush(now)
  }

  private event(p: Record<string, any>, now: number): AgentEvent[] {
    if (p.type === "turn_aborted" || (p.type === "user_message" && typeof p.message === "string" && !looksInjected(p.message))) {
      this.pending.drop()
      return [{ type: "interrupt" }]
    }
    if (p.type === "task_complete") return this.pending.release("final")
    if (p.type !== "agent_message" || typeof p.message !== "string" || !p.message.trim()) return []
    if (p.phase === "commentary") return this.pending.hold("", p.message, now)
    if (p.phase === "final_answer") return [...this.pending.release("intermediate"), { type: "message", text: p.message, kind: "final" }]
    // Codex Desktop writes no phase: the message is final only if the turn completes right after it.
    return this.pending.hold("", p.message, now, false)
  }

  private toolCall(p: Record<string, any>): AgentEvent[] {
    const isQuestion = p.type === "function_call" && QUESTION_TOOLS.has(p.name)
    const out = this.pending.resolve(null, isQuestion)
    if (isQuestion) {
      let args: unknown = p.arguments
      if (typeof args === "string") {
        try {
          args = JSON.parse(args)
        } catch {
          args = null
        }
      }
      const texts = questionTexts(args)
      if (texts.length) out.push({ type: "question", texts })
    }
    return out
  }
}
