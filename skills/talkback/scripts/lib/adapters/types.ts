export type AgentEvent =
  | { type: "message"; text: string }
  | { type: "question"; texts: string[] }
  | { type: "interrupt" }
  // Claude Code moved the session to another transcript file (resume, fork).
  | { type: "continuedIn"; sessionId: string }

export interface Adapter {
  push(line: unknown): AgentEvent[]
}

export const isRecord = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null

export function questionTexts(input: unknown): string[] {
  if (!isRecord(input) || !Array.isArray(input.questions)) return []
  return input.questions.map((q: unknown) => (isRecord(q) ? q.question : null)).filter((q): q is string => typeof q === "string" && q.length > 0)
}

// Harness-injected user turns (task notifications, slash command expansions, reminders) start with a tag.
export const looksInjected = (text: string) => text.trimStart().startsWith("<")
