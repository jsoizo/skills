// Layer 3: synthesize segments, concatenate them, play the result. Engine dependent.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Role, Segment } from "./reading"

// The pipeline, not the engine, fixes the format so segments from different voices can be joined.
export const SAMPLE_RATE = 22050

export interface VoiceConfig {
  voices: Record<Role, string>
  rate: number | null
}

export function voiceConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  const rate = Number(env.TALKBACK_RATE)
  return {
    voices: { ja: env.TALKBACK_VOICE_JA || "Kyoko", en: env.TALKBACK_VOICE_EN || "Samantha" },
    rate: Number.isFinite(rate) && rate > 0 ? rate : null,
  }
}

export async function synthesizeSay(text: string, voice: string, rate: number | null, out: string, signal?: AbortSignal): Promise<void> {
  // Text goes through stdin: as an argument, text starting with "-" is parsed as an option.
  const args = ["say", "-v", voice, ...(rate ? ["-r", String(rate)] : []), "-f", "-", "-o", out, "--file-format=WAVE", `--data-format=LEI16@${SAMPLE_RATE}`]
  const proc = Bun.spawn(args, { stdin: new Blob([text]), stdout: "ignore", stderr: "pipe" })
  const stop = () => proc.kill()
  signal?.addEventListener("abort", stop, { once: true })
  const code = await proc.exited.finally(() => signal?.removeEventListener("abort", stop))
  if (signal?.aborted) throw new Error("synthesis aborted")
  if (code !== 0) throw new Error(`say exited with ${code}: ${(await new Response(proc.stderr).text()).trim()}`)
}

export function pcmFromWav(buf: Uint8Array): Uint8Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = (o: number) => String.fromCharCode(...buf.subarray(o, o + 4))
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a WAV file")
  let fmtOk = false
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = tag(o)
    const size = view.getUint32(o + 4, true)
    if (id === "fmt ") {
      const channels = view.getUint16(o + 10, true)
      const rate = view.getUint32(o + 12, true)
      const bits = view.getUint16(o + 22, true)
      if (channels !== 1 || rate !== SAMPLE_RATE || bits !== 16) throw new Error(`unexpected WAV format: ${channels}ch ${rate}Hz ${bits}bit`)
      fmtOk = true
    } else if (id === "data") {
      if (!fmtOk) throw new Error("WAV data before fmt")
      return buf.subarray(o + 8, Math.min(buf.length, o + 8 + size))
    }
    o += 8 + size + (size & 1)
  }
  throw new Error("WAV has no data chunk")
}

export function wavFromPcm(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(44 + len)
  const v = new DataView(out.buffer)
  const put = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  put(0, "RIFF")
  v.setUint32(4, 36 + len, true)
  put(8, "WAVE")
  put(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, SAMPLE_RATE, true)
  v.setUint32(28, SAMPLE_RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  put(36, "data")
  v.setUint32(40, len, true)
  let o = 44
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

export class Synthesizer {
  private dir: string
  private seq = 0

  constructor(
    private config: VoiceConfig,
    sessionId = "",
  ) {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), `talkback-${sessionId}-`))
  }

  async render(segments: Segment[], signal?: AbortSignal): Promise<string> {
    const id = ++this.seq
    const parts = segments.map((s, i) => path.join(this.dir, `${id}-${i}.wav`))
    try {
      await Promise.all(segments.map((s, i) => synthesizeSay(s.text, this.config.voices[s.role], this.config.rate, parts[i], signal)))
      const pcm = parts.map((p) => pcmFromWav(new Uint8Array(fs.readFileSync(p))))
      const out = path.join(this.dir, `${id}.wav`)
      fs.writeFileSync(out, wavFromPcm(pcm))
      return out
    } finally {
      for (const p of parts) fs.rmSync(p, { force: true })
    }
  }

  dispose(): void {
    fs.rmSync(this.dir, { recursive: true, force: true })
  }
}

export async function play(file: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  const proc = Bun.spawn(["afplay", file], { stdout: "ignore", stderr: "ignore" })
  const stop = () => proc.kill()
  signal.addEventListener("abort", stop, { once: true })
  try {
    await proc.exited
  } finally {
    signal.removeEventListener("abort", stop)
  }
}

// Splits speech into chunks of a few sentences so playback starts before a long reply is fully synthesized.
export function chunkSentences(text: string, maxSentences = 3, maxChars = 300): string[] {
  const sentences = text.split(/(?<=[。！？!?\n])/).map((s) => s.trim()).filter(Boolean)
  const chunks: string[] = []
  let cur: string[] = []
  for (const s of sentences) {
    if (cur.length && (cur.length >= maxSentences || cur.join("").length + s.length > maxChars)) {
      chunks.push(cur.join("\n"))
      cur = []
    }
    cur.push(s)
  }
  if (cur.length) chunks.push(cur.join("\n"))
  return chunks
}
