// Stops speech when the user starts typing to the agent or starts voice input.
import { dlopen, FFIType } from "bun:ffi"

export interface InputProbe {
  // Seconds since the last key press anywhere. Reads the time only, never the key, so no Input Monitoring permission is needed.
  keyIdleSeconds(): number
  // Whether any app is using the default input device; null when it cannot be read or cannot be told apart from our own playback.
  micRunning(): boolean | null
  frontBundleId(): string | null
}

// Apps where typing is taken as talking to the agent.
const AGENT_APPS = new Set([
  "com.anthropic.claudefordesktop",
  "com.apple.Terminal",
  "com.googlecode.iterm2",
  "com.mitchellh.ghostty",
  "com.github.wez.wezterm",
  "dev.warp.Warp-Stable",
  "net.kovidgoyal.kitty",
  "com.microsoft.VSCode",
  "com.todesktop.230313mzl4w4u92",
  "com.openai.codex",
])

const KEY_DEDUPE_MS = 50
const FRONT_CACHE_MS = 1000

export class BargeIn {
  private lastKeyAt = 0
  private micArmed = false
  private front: { id: string | null; at: number } | null = null

  constructor(private probe: InputProbe) {}

  // Call when speech starts. A mic already in use (a meeting) only counts after it goes idle once.
  start(): void {
    this.lastKeyAt = Date.now()
    this.micArmed = this.probe.micRunning() === false
    this.front = null
  }

  poll(): boolean {
    const mic = this.probe.micRunning()
    if (mic === false) this.micArmed = true
    else if (mic === true && this.micArmed) return true

    const keyAt = Date.now() - this.probe.keyIdleSeconds() * 1000
    if (keyAt - this.lastKeyAt <= KEY_DEDUPE_MS) return false
    this.lastKeyAt = keyAt
    const id = this.frontApp()
    return id !== null && AGENT_APPS.has(id)
  }

  private frontApp(): string | null {
    const t = Date.now()
    if (!this.front || t - this.front.at > FRONT_CACHE_MS) this.front = { id: this.probe.frontBundleId(), at: t }
    return this.front.id
  }
}

const fourcc = (s: string) => [...s].reduce((n, c) => (n << 8) | c.charCodeAt(0), 0) >>> 0
const SYSTEM_OBJECT = 1
const GLOBAL_SCOPE = fourcc("glob")
const OUTPUT_SCOPE = fourcc("outp")
const HID_SYSTEM_STATE = 1
const KEY_DOWN = 10

// bun:ffi is experimental; any failure turns barge-in off instead of stopping speech.
export function nativeProbe(): InputProbe | null {
  try {
    const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
      CGEventSourceSecondsSinceLastEventType: { args: [FFIType.u32, FFIType.u32], returns: FFIType.f64 },
    })
    const ca = dlopen("/System/Library/Frameworks/CoreAudio.framework/CoreAudio", {
      AudioObjectGetPropertyData: { args: [FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      AudioObjectGetPropertyDataSize: { args: [FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    })
    const address = (selector: string, scope = GLOBAL_SCOPE) => new Uint32Array([fourcc(selector), scope, 0])
    const getU32 = (obj: number, selector: string): number | null => {
      const out = new Uint32Array(1)
      const status = ca.symbols.AudioObjectGetPropertyData(obj, address(selector), 0, null, new Uint32Array([4]), out)
      return status === 0 ? out[0] : null
    }
    // "Running somewhere" is per device, so a headset that also plays our speech would look like the user starting to talk.
    const playsOutput = (device: number): boolean => {
      if (device === getU32(SYSTEM_OBJECT, "dOut")) return true
      const size = new Uint32Array(1)
      const status = ca.symbols.AudioObjectGetPropertyDataSize(device, address("stm#", OUTPUT_SCOPE), 0, null, size)
      return status !== 0 || size[0] > 0
    }
    return {
      keyIdleSeconds: () => cg.symbols.CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, KEY_DOWN),
      // The default device is looked up on every call because the user may switch microphones.
      micRunning: () => {
        const device = getU32(SYSTEM_OBJECT, "dIn ")
        if (!device || playsOutput(device)) return null
        const running = getU32(device, "gone")
        return running === null ? null : running !== 0
      },
      frontBundleId: () => {
        const r = Bun.spawnSync(["sh", "-c", 'lsappinfo info -only bundleID "$(lsappinfo front)"'], { stderr: "ignore" })
        return r.stdout.toString().match(/"CFBundleIdentifier"="([^"]+)"/)?.[1] ?? null
      },
    }
  } catch {
    return null
  }
}
