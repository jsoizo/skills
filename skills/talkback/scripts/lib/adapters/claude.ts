import { isRecord, looksInjected, questionTexts, type Adapter, type AgentEvent } from "./types"

const QUESTION_TOOLS = new Set(["AskUserQuestion"])
const TYPED_SOURCES = new Set(["typed", "queued", "suggestion_accepted", "sdk"])
const INTERRUPTED = "[Request interrupted by user"
// `!` shell commands and local command output are written as the user's turn but are not instructions to the agent.
const NOT_AN_INSTRUCTION = /^\s*<(?:bash-input|bash-stdout|bash-stderr|local-command-stdout|local-command-stderr|local-command-caveat)>/

export class ClaudeAdapter implements Adapter {
  push(line: unknown): AgentEvent[] {
    if (!isRecord(line) || line.isSidechain === true) return []
    if (line.type === "continued-in" && typeof line.continuedInSessionId === "string") {
      return [{ type: "continuedIn", sessionId: line.continuedInSessionId }]
    }
    if (line.type === "user") return this.user(line)
    if (line.type === "assistant") return this.assistant(line)
    // A prompt typed while the agent is busy is first recorded as a queued command.
    if (line.type === "attachment" && isRecord(line.attachment) && line.attachment.type === "queued_command" && line.attachment.origin?.kind === "human") {
      return [{ type: "interrupt" }]
    }
    return []
  }

  private user(line: Record<string, any>): AgentEvent[] {
    const text = userText(line.message?.content)
    if (text === null) return []
    const interrupted = text.startsWith(INTERRUPTED)
    if (!interrupted && (NOT_AN_INSTRUCTION.test(text) || !typedByUser(line, text))) return []
    return [{ type: "interrupt" }]
  }

  private assistant(line: Record<string, any>): AgentEvent[] {
    const msg = line.message
    if (!isRecord(msg) || !Array.isArray(msg.content)) return []
    const out: AgentEvent[] = []
    for (const block of msg.content) {
      if (!isRecord(block)) continue
      if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
        out.push({ type: "message", text: block.text })
      } else if (block.type === "tool_use" && QUESTION_TOOLS.has(block.name)) {
        const texts = questionTexts(block.input)
        if (texts.length) out.push({ type: "question", texts })
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
