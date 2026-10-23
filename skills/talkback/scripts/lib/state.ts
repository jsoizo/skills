import fs from "node:fs"
import type { AgentKind } from "./agent"
import { sessionsDir, sessionStatePath } from "./paths"
import { isAlive, type ProcRef } from "./proc"

export interface SessionState {
  sessionId: string
  agent: AgentKind
  agentProc: ProcRef
  transcript: string
  offset: number
  cwd: string
  watcherProc: ProcRef | null
  startedAt: string
}

export function readState(id: string): SessionState | null {
  try {
    return JSON.parse(fs.readFileSync(sessionStatePath(id), "utf8"))
  } catch {
    return null
  }
}

export function writeState(s: SessionState): void {
  fs.mkdirSync(sessionsDir(), { recursive: true, mode: 0o700 })
  const p = sessionStatePath(s.sessionId)
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(s, null, 2), { mode: 0o600 })
  fs.renameSync(`${p}.tmp`, p)
}

export function removeState(id: string): void {
  fs.rmSync(sessionStatePath(id), { force: true })
}

export function allStates(): SessionState[] {
  if (!fs.existsSync(sessionsDir())) return []
  return fs
    .readdirSync(sessionsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => readState(f.slice(0, -5)))
    .filter((s): s is SessionState => s !== null)
}

export const watcherAlive = (s: SessionState | null): boolean => !!s?.watcherProc && isAlive(s.watcherProc)

export function liveSessions(): SessionState[] {
  return allStates().filter(watcherAlive)
}
