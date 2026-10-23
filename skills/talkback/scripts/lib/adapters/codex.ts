import { isRecord, looksInjected, questionTexts, type Adapter, type AgentEvent } from "./types"

const QUESTION_TOOLS = new Set(["request_user_input"])

export class CodexAdapter implements Adapter {
  push(line: unknown): AgentEvent[] {
    if (!isRecord(line) || !isRecord(line.payload)) return []
    const p = line.payload
    if (line.type === "event_msg") return this.event(p)
    // `message` items duplicate agent_message events; only tool calls matter here.
    if (line.type === "response_item" && p.type === "function_call" && QUESTION_TOOLS.has(p.name)) return this.question(p.arguments)
    return []
  }

  private event(p: Record<string, any>): AgentEvent[] {
    if (p.type === "turn_aborted" || (p.type === "user_message" && typeof p.message === "string" && !looksInjected(p.message))) {
      return [{ type: "interrupt" }]
    }
    if (p.type === "agent_message" && typeof p.message === "string" && p.message.trim()) return [{ type: "message", text: p.message }]
    return []
  }

  private question(args: unknown): AgentEvent[] {
    if (typeof args === "string") {
      try {
        args = JSON.parse(args)
      } catch {
        return []
      }
    }
    const texts = questionTexts(args)
    return texts.length ? [{ type: "question", texts }] : []
  }
}
