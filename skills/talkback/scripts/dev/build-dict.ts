// Converts kanalizer-dataset's dataset.jsonl into the bundled TSV.
// Usage: bun scripts/dev/build-dict.ts <dataset.jsonl>
import fs from "node:fs"
import path from "node:path"
import { KATAKANA_DIR } from "../lib/paths"

const src = process.argv[2]
if (!src) {
  console.error("usage: bun scripts/dev/build-dict.ts <dataset.jsonl>")
  process.exit(2)
}

const entries = new Map<string, string>()
for (const line of fs.readFileSync(src, "utf8").split("\n")) {
  if (!line.trim()) continue
  const { word, kata } = JSON.parse(line) as { word: string; kata: string[] }
  const w = word.toLowerCase()
  const k = kata?.[0]
  if (!/^[a-z][a-z0-9']*$/.test(w) || !k || !/^[゠-ヿ]+$/.test(k) || entries.has(w)) continue
  entries.set(w, k)
}

const out = path.join(KATAKANA_DIR, "kanalizer.tsv")
const body = [...entries].sort(([a], [b]) => (a < b ? -1 : 1)).map(([w, k]) => `${w}\t${k}`).join("\n")
fs.writeFileSync(out, `${body}\n`)
console.log(`wrote ${entries.size} entries to ${path.relative(process.cwd(), out)}`)
