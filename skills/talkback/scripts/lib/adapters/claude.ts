import { isRecord, looksInjected, PendingText, questionTexts, type Adapter, type AgentEvent } from "./types"

const QUESTION_TOOLS = new Set(["AskUserQuestion"])
const TYPED_SOURCES = new Set(["typed", "queued", "suggestion_accepted", "sdk"])
const INTERRUPTED = "[Request interrupted by user"

export class ClaudeAdapter implements Adapter {
  private pending = new PendingText()

  push(line: unknown, now: number): AgentEvent[] {
    if (!isRecord(line) || line.isSidechain === true) return []
    if (line.type === "continued-in" && typeof line.continuedInSessionId === "string") {
      return [...this.pending.release("intermediate"), { type: "continuedIn", sessionId: line.continuedInSessionId }]
    }
    if (line.type === "user") return this.user(line)
    if (line.type === "assistant") return this.assistant(line, now)
    // A prompt typed while the agent is busy is first recorded as a queued command.
    if (line.type === "attachment" && isRecord(line.attachment) && line.attachment.type === "queued_command" && line.attachment.origin?.kind === "human") {
      this.pending.drop()
      return [{ type: "interrupt" }]
    }
    return []
  }

  flush(now: number): AgentEvent[] {
    return this.pending.flush(now)
  }

  private user(line: Record<string, any>): AgentEvent[] {
    const text = userText(line.message?.content)
    if (text === null) return []
    const interrupted = text.startsWith(INTERRUPTED)
    if (!interrupted && !typedByUser(line, text)) return []
    this.pending.drop()
    return [{ type: "interrupt" }]
  }

  private assistant(line: Record<string, any>, now: number): AgentEvent[] {
    const msg = line.message
    if (!isRecord(msg) || !Array.isArray(msg.content)) return []
    const id = typeof msg.id === "string" ? msg.id : ""
    const out: AgentEvent[] = []
    for (const block of msg.content) {
      if (!isRecord(block)) continue
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        if (msg.stop_reason === "tool_use") out.push(...this.pending.hold(id, block.text, now))
        else out.push(...this.pending.release("intermediate"), { type: "message", text: block.text, kind: "final" })
      } else if (block.type === "tool_use") {
        const isQuestion = QUESTION_TOOLS.has(block.name)
        out.push(...this.pending.resolve(id, isQuestion))
        if (isQuestion) {
          const texts = questionTexts(block.input)
          if (texts.length) out.push({ type: "question", texts })
        }
      }
    }
    return out
  }
}

// Tool results carry no text block, so they come back as null.
function userText(content: unknown): string | null {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return null
  const block = content.find((b) => isRecord(b) && (b.type === "text" || b.type === "image"))
  if (!block) return null
  return block.type === "text" && typeof block.text === "string" ? block.text : ""
}

// Newer transcripts say who wrote the turn; older ones only mark harness turns with isMeta or a leading tag.
function typedByUser(line: Record<string, any>, text: string): boolean {
  if (isRecord(line.origin) && typeof line.origin.kind === "string") return line.origin.kind === "human"
  if (typeof line.promptSource === "string") return TYPED_SOURCES.has(line.promptSource)
  return line.isMeta !== true && !looksInjected(text)
}
