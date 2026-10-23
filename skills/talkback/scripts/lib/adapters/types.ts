export type MessageKind = "intermediate" | "final"

export type AgentEvent =
  | { type: "message"; text: string; kind: MessageKind }
  | { type: "question"; texts: string[] }
  | { type: "interrupt" }
  // Claude Code moved the session to another transcript file (resume, fork).
  | { type: "continuedIn"; sessionId: string }

export interface Adapter {
  push(line: unknown, now: number): AgentEvent[]
  flush(now: number): AgentEvent[]
}

// A text that precedes a tool call is intermediate unless the tool asks the user a question,
// and the tool call is written as a separate line right after the text.
export const PENDING_TIMEOUT_MS = 1000

interface Pending {
  key: string
  text: string
  at: number
  // Codex without `phase` waits for the next event instead of a timeout.
  timeout: boolean
}

export class PendingText {
  private pending: Pending | null = null

  hold(key: string, text: string, now: number, timeout = true): AgentEvent[] {
    const out = this.release("intermediate")
    this.pending = { key, text, at: now, timeout }
    return out
  }

  // Resolves the held text when the tool call that follows it arrives.
  resolve(key: string | null, isQuestion: boolean): AgentEvent[] {
    if (this.pending && key !== null && this.pending.key !== key) return this.release("intermediate")
    return this.release(isQuestion ? "final" : "intermediate")
  }

  release(kind: MessageKind): AgentEvent[] {
    if (!this.pending) return []
    const text = this.pending.text
    this.pending = null
    return [{ type: "message", text, kind }]
  }

  drop(): void {
    this.pending = null
  }

  flush(now: number): AgentEvent[] {
    return this.pending?.timeout && now - this.pending.at >= PENDING_TIMEOUT_MS ? this.release("intermediate") : []
  }
}

export const isRecord = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null

export function questionTexts(input: unknown): string[] {
  if (!isRecord(input) || !Array.isArray(input.questions)) return []
  return input.questions.map((q: unknown) => (isRecord(q) ? q.question : null)).filter((q): q is string => typeof q === "string" && q.length > 0)
}

// Harness-injected user turns (task notifications, slash command expansions, reminders) start with a tag.
export const looksInjected = (text: string) => text.trimStart().startsWith("<")
