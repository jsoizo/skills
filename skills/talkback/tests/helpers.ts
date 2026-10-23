import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const CLI = path.resolve(import.meta.dir, "..", "scripts", "talkback.ts")

export function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "talkback-test-"))
}

// Stand-ins for say and afplay, found first on PATH: they record what would be heard and make no sound.
// say writes a short silent WAV in the pipeline format; afplay takes AFPLAY_SECONDS like a real playback.
const FAKE_SAY = `#!${process.execPath}
import fs from "node:fs"
const a = process.argv.slice(2)
const out = a[a.indexOf("-o") + 1]
const text = await Bun.stdin.text()
fs.appendFileSync(process.env.HOME + "/say.jsonl", JSON.stringify({ voice: a[a.indexOf("-v") + 1], text, out }) + "\\n")
const pcm = 2205 * 2
const b = Buffer.alloc(44 + pcm)
b.write("RIFF", 0); b.writeUInt32LE(36 + pcm, 4); b.write("WAVE", 8); b.write("fmt ", 12)
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(22050, 24)
b.writeUInt32LE(44100, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(pcm, 40)
fs.writeFileSync(out, b)
`
const FAKE_AFPLAY = `#!/bin/sh
echo "$1" >> "$HOME/played.txt"
sleep "\${AFPLAY_SECONDS:-0}"
`

export function fakeAudioBin(home: string): string {
  const bin = path.join(home, "bin")
  fs.mkdirSync(bin, { recursive: true })
  fs.writeFileSync(path.join(bin, "say"), FAKE_SAY, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, "afplay"), FAKE_AFPLAY, { mode: 0o755 })
  return bin
}

// What was played, in order: each played WAV joined from the say calls that produced its segments.
export function spoken(home: string): string[] {
  const read = (f: string) => (fs.existsSync(path.join(home, f)) ? fs.readFileSync(path.join(home, f), "utf8") : "")
  const says = read("say.jsonl")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { text: string; out: string })
  return read("played.txt")
    .split("\n")
    .filter(Boolean)
    .map((played) => {
      const stem = played.replace(/\.wav$/, "-")
      return says
        .filter((s) => s.out.startsWith(stem))
        .sort((a, b) => Number(a.out.slice(stem.length, -4)) - Number(b.out.slice(stem.length, -4)))
        .map((s) => s.text)
        .join("")
    })
}

// Built from scratch so the Claude Code or Codex session running the tests does not leak in.
export function baseEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: `${fakeAudioBin(home)}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home, TMPDIR: path.join(home, "tmp"), ...extra }
}

export function runCli(args: string[], env: Record<string, string>) {
  fs.mkdirSync(env.TMPDIR, { recursive: true })
  const r = Bun.spawnSync([process.execPath, CLI, ...args], { env, cwd: env.HOME })
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() }
}

export async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 10000, label = "condition"): Promise<T> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`)
    await Bun.sleep(50)
  }
}

export const claude = {
  text: (id: string, text: string, stop: string, cwd = "/work/proj") => ({ type: "assistant", cwd, message: { id, content: [{ type: "text", text }], stop_reason: stop } }),
  tool: (id: string, name: string, input: unknown = {}) => ({ type: "assistant", message: { id, content: [{ type: "tool_use", id: `t-${id}`, name, input }], stop_reason: "tool_use" } }),
  user: (text: string, extra: Record<string, unknown> = {}) => ({ type: "user", message: { role: "user", content: text }, ...extra }),
  toolResult: () => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] } }),
}

export function appendLines(file: string, lines: unknown[]) {
  fs.appendFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n")
}
