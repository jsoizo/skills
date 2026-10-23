import os from "node:os"
import path from "node:path"

export const SKILL_DIR = path.resolve(import.meta.dir, "..", "..")
export const SCRIPTS_DIR = path.join(SKILL_DIR, "scripts")
export const CLI_PATH = path.join(SCRIPTS_DIR, "talkback.ts")
export const WATCHER_PATH = path.join(SCRIPTS_DIR, "watcher.ts")
export const KATAKANA_DIR = path.join(SKILL_DIR, "assets", "katakana")

export const stateDir = () => path.join(os.homedir(), ".local", "state", "talkback")

export const sessionsDir = () => path.join(stateDir(), "sessions")
export const logsDir = () => path.join(stateDir(), "logs")
export const playLockPath = () => path.join(stateDir(), "play.lock")
export const waitingDir = () => path.join(stateDir(), "waiting")
export const hushPath = () => path.join(stateDir(), "hush")
export const lastSpeakerPath = () => path.join(stateDir(), "last-speaker")
export const sessionStatePath = (id: string) => path.join(sessionsDir(), `${id}.json`)
export const sessionLogPath = (id: string) => path.join(logsDir(), `${id}.log`)
