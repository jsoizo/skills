// Layer 2: decide how English is read and split text into voice-role segments. Engine dependent.
import fs from "node:fs"
import path from "node:path"
import { KATAKANA_DIR } from "./paths"

export type Role = "ja" | "en"

export interface Segment {
  role: Role
  text: string
}

export interface ReadingProfile {
  toSegments(text: string): Segment[]
}

const LETTERS: Record<string, string> = {
  a: "エー", b: "ビー", c: "シー", d: "ディー", e: "イー", f: "エフ", g: "ジー", h: "エイチ", i: "アイ",
  j: "ジェー", k: "ケー", l: "エル", m: "エム", n: "エヌ", o: "オー", p: "ピー", q: "キュー", r: "アール",
  s: "エス", t: "ティー", u: "ユー", v: "ブイ", w: "ダブリュー", x: "エックス", y: "ワイ", z: "ゼット",
}

export const spellLetters = (w: string) => [...w.toLowerCase()].map((c) => LETTERS[c] ?? c).join("")

export function loadTsv(file: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!fs.existsSync(file)) return map
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue
    const tab = line.indexOf("\t")
    if (tab > 0) map.set(line.slice(0, tab).toLowerCase(), line.slice(tab + 1).trim())
  }
  return map
}

// An ASCII run that starts and ends with a letter or digit, e.g. `useEffect`, `Button.tsx`, `v1.3.11`.
const RUN_RE = /[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?/g
const VERSION_RE = /^v?\d+(?:\.\d+)*$/
// Three or more space-separated words are an English sentence, read by one voice from start to end.
const SENTENCE_RE = /[A-Za-z][\w'’.,:;!?/-]*(?:[ \t]+[A-Za-z0-9][\w'’.,:;!?/-]*){2,}/g
// Only these count as file extensions, so `React.memo` is not spelled out.
const EXTENSIONS = new Set(
  "c cc cjs conf cpp cs css csv env gif go gradle h hpp html ini java jpeg jpg js json jsonl jsx kt kts lock log lua md mdx mjs mts pdf php png py rb rs sass scss sh sql svg swift toml ts tsv tsx txt vue wav xml yaml yml zip zsh".split(" "),
)

export function splitCamel(part: string): string[] {
  return part
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
}

interface Dictionaries {
  overrides: Map<string, string>
  words: Map<string, string>
}

export function loadDictionaries(dir = KATAKANA_DIR): Dictionaries {
  return { overrides: loadTsv(path.join(dir, "overrides.tsv")), words: loadTsv(path.join(dir, "kanalizer.tsv")) }
}

// `say` profile: overrides → letter names → kanalizer; a run with any unresolved word goes to the English voice.
export class SayReadingProfile implements ReadingProfile {
  constructor(private dicts: Dictionaries) {}

  resolveWord(word: string, isExtension: boolean): string | undefined {
    const lower = word.toLowerCase()
    const override = this.dicts.overrides.get(lower)
    if (override) return override
    if (/^[A-Za-z]$/.test(word) || /^[A-Z]{2,3}$/.test(word) || isExtension) return spellLetters(word)
    if (/^[A-Z]{2,5}s$/.test(word)) return `${spellLetters(word.slice(0, -1))}ズ`
    if (/^\d/.test(word)) return word
    const known = this.dicts.words.get(lower)
    if (known) return known
    // Short acronyms the dictionary does not know (UUID, AWSV) are spelled; HEAD or TODO are words.
    if (/^[A-Z]{4,5}$/.test(word)) return spellLetters(word)
    return undefined
  }

  // Returns null when the run cannot be read in katakana as a whole.
  resolveRun(run: string): string | null {
    if (!/[A-Za-z]/.test(run)) return run
    if (VERSION_RE.test(run)) return run.startsWith("v") ? `ブイ${run.slice(1)}` : run
    const whole = this.dicts.overrides.get(run.toLowerCase())
    if (whole) return whole
    // Separators split groups, except between digits: `python3.12` keeps 3.12, `1.2.3-beta` keeps 1.2.3.
    const groups: { sep: string; tokens: string[] }[] = [{ sep: "", tokens: [] }]
    for (const tok of run.match(/\d+(?:[.-]\d+)*|[._/-]+|[A-Za-z]+/g) ?? []) {
      if (/^[._/-]/.test(tok)) groups.push({ sep: tok, tokens: [] })
      else groups.at(-1)!.tokens.push(tok)
    }
    const out: string[] = []
    for (const [i, g] of groups.entries()) {
      if (!g.tokens.length) continue
      const last = g.tokens[0]
      const isExtension = i === groups.length - 1 && i > 0 && g.sep === "." && g.tokens.length === 1 && EXTENSIONS.has(last.toLowerCase())
      const words = isExtension ? [last] : g.tokens.flatMap((t) => (/^\d|^[A-Z]{2,5}s$/.test(t) ? [t] : splitCamel(t)))
      const read: string[] = []
      for (const w of words) {
        const r = this.resolveWord(w, isExtension)
        if (r === undefined) return null
        read.push(r)
      }
      out.push(read.join(""))
    }
    return out.join(" ")
  }

  toSegments(text: string): Segment[] {
    const segments: Segment[] = []
    const add = (role: Role, t: string) => {
      if (!t) return
      const last = segments.at(-1)
      if (last?.role === role) last.text += role === "en" ? ` ${t}` : t
      else segments.push({ role, text: t })
    }
    const words = (span: string) => {
      let pos = 0
      for (const m of span.matchAll(RUN_RE)) {
        add("ja", span.slice(pos, m.index))
        const read = this.resolveRun(m[0])
        if (read !== null) add("ja", read)
        else add("en", m[0].split(/[_/-]+/).flatMap(splitCamel).join(" "))
        pos = m.index! + m[0].length
      }
      add("ja", span.slice(pos))
    }
    let pos = 0
    for (const m of text.matchAll(SENTENCE_RE)) {
      words(text.slice(pos, m.index))
      add("en", m[0])
      pos = m.index! + m[0].length
    }
    words(text.slice(pos))
    return segments.filter((s) => s.text.trim())
  }
}
