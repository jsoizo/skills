import { afterAll, expect, test } from "bun:test"
import fs from "node:fs"
import { SAMPLE_RATE, Synthesizer } from "../scripts/lib/audio"

const hasSay = Bun.spawnSync(["which", "say"]).exitCode === 0
const synth = new Synthesizer({ voices: { ja: "Kyoko", en: "Samantha" }, rate: null })
afterAll(() => synth.dispose())

function wavInfo(file: string) {
  const b = fs.readFileSync(file)
  return { channels: b.readUInt16LE(22), rate: b.readUInt32LE(24), bits: b.readUInt16LE(34), dataBytes: b.readUInt32LE(40), fileBytes: b.length }
}

test.skipIf(!hasSay)("segments in both voices become one WAV in the pipeline format", async () => {
  const ja = await synth.render([{ role: "ja", text: "のストアを更新しました。" }])
  const en = await synth.render([{ role: "en", text: "Zustand" }])
  const both = await synth.render([
    { role: "en", text: "Zustand" },
    { role: "ja", text: "のストアを更新しました。" },
  ])
  const info = wavInfo(both)
  expect({ channels: info.channels, rate: info.rate, bits: info.bits }).toEqual({ channels: 1, rate: SAMPLE_RATE, bits: 16 })
  expect(info.dataBytes).toBe(wavInfo(ja).dataBytes + wavInfo(en).dataBytes)
  expect(info.fileBytes).toBe(44 + info.dataBytes)
})

// Regression: passed as an argument, this text was parsed by say as an option.
test.skipIf(!hasSay)("text that starts with a dash is spoken, not parsed as an option", async () => {
  const file = await synth.render([{ role: "ja", text: "--dry-run オプションを付けてください。" }])
  expect(wavInfo(file).dataBytes).toBeGreaterThan(0)
})
