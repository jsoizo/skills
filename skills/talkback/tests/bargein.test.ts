import { describe, expect, test } from "bun:test"
import { BargeIn, type InputProbe } from "../scripts/lib/bargein"

const CLAUDE = "com.anthropic.claudefordesktop"
const BROWSER = "com.microsoft.edgemac"

// Stands in for the keyboard, microphone and window server; the BargeIn logic is what runs.
class Desk implements InputProbe {
  lastKey = Date.now() - 60_000
  mic: boolean | null = false
  front: string | null = CLAUDE
  keyIdleSeconds = () => (Date.now() - this.lastKey) / 1000
  micRunning = () => this.mic
  frontBundleId = () => this.front
  type(app: string) {
    this.front = app
    this.lastKey = Date.now()
  }
}

function speaking(desk: Desk): BargeIn {
  const b = new BargeIn(desk)
  b.start()
  return b
}

describe("barge-in", () => {
  test("typing in the agent's app stops speech", async () => {
    const desk = new Desk()
    const b = speaking(desk)
    expect(b.poll()).toBe(false)
    await Bun.sleep(100)
    desk.type(CLAUDE)
    expect(b.poll()).toBe(true)
  })

  test("typing in another app does not", async () => {
    const desk = new Desk()
    const b = speaking(desk)
    await Bun.sleep(100)
    desk.type(BROWSER)
    expect(b.poll()).toBe(false)
  })

  test("a key pressed before speech started does not", () => {
    const desk = new Desk()
    desk.type(CLAUDE)
    expect(speaking(desk).poll()).toBe(false)
  })

  test("the microphone starting stops speech", () => {
    const desk = new Desk()
    const b = speaking(desk)
    desk.mic = true
    expect(b.poll()).toBe(true)
  })

  // A meeting app holding the microphone must not silence every reply.
  test("a microphone already in use counts only after it goes idle once", () => {
    const desk = new Desk()
    desk.mic = true
    const b = speaking(desk)
    expect(b.poll()).toBe(false)
    desk.mic = false
    expect(b.poll()).toBe(false)
    desk.mic = true
    expect(b.poll()).toBe(true)
  })

  test("an unreadable microphone is ignored", () => {
    const desk = new Desk()
    desk.mic = null
    expect(speaking(desk).poll()).toBe(false)
  })
})
