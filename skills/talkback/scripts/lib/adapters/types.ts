export type AgentEvent =
  // final: the message ends the turn rather than leading into a tool call.
  | { type: "message"; text: string; final: boolean }
  | { type: "question"; questions: Question[] }
  | { type: "interrupt" }
  // Claude Code moved the session to another transcript file (resume, fork).
  | { type: "continuedIn"; sessionId: string }

export interface Question {
  text: string
  options: string[]
}

export interface Adapter {
  push(line: unknown): AgentEvent[]
}

export const isRecord = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null

export function parseQuestions(input: unknown): Question[] {
  if (!isRecord(input) || !Array.isArray(input.questions)) return []
  return input.questions.flatMap((q: unknown) => {
    if (!isRecord(q) || typeof q.question !== "string" || !q.question) return []
    const options = Array.isArray(q.options) ? q.options.map((o: unknown) => (isRecord(o) ? o.label : null)).filter((l): l is string => typeof l === "string" && l.length > 0) : []
    return [{ text: q.question, options }]
  })
}

// Harness-injected user turns (task notifications, slash command expansions, reminders) start with a tag.
export const looksInjected = (text: string) => text.trimStart().startsWith("<")
