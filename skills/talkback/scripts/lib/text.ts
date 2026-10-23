// Layer 1: Markdown → plain text to be spoken. Engine independent.
import type { MessageKind } from "./adapters/types"

const INLINE_CODE_MAX = 20

const LANGUAGE_NAMES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  javascript: "JavaScript",
  sh: "シェル",
  bash: "シェル",
  zsh: "シェル",
  shell: "シェル",
  console: "シェル",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  kt: "Kotlin",
  yml: "YAML",
  yaml: "YAML",
  json: "JSON",
  md: "Markdown",
  markdown: "Markdown",
  sql: "SQL",
}

const PLAIN_LANGUAGES = new Set(["", "text", "txt", "plain", "plaintext"])

export function codeSummary(language: string | undefined, body: string): string {
  const trimmed = body.replace(/\n$/, "")
  const lines = trimmed ? trimmed.split("\n").length : 0
  const lang = (language ?? "").trim().split(/\s+/)[0].toLowerCase()
  if (PLAIN_LANGUAGES.has(lang)) return `コード ${lines} 行`
  return `${LANGUAGE_NAMES[lang] ?? lang} のコード ${lines} 行`
}

// ASCII only, so Japanese written right after a URL is not swallowed; trailing punctuation stays in the sentence.
const URL_RE = /https?:\/\/[\w\-.~:/?#@!$&'*+,;=%]+/g
const replaceUrls = (text: string) => text.replace(URL_RE, (m) => `リンク${m.match(/[.,;:!?]+$/)?.[0] ?? ""}`)
const PATH_RE = /(?<![\w@.:/-])(?:~|\.{1,2})?\/?(?:[\w@.-]+\/)+([\w@.-]*[\w@-])\/?/g

// A file name, or anything rooted at /, ./, ../ or ~/. Dates (2026/10/23) and ON/OFF stay as they are.
function isPath(token: string, base: string): boolean {
  return /\.[A-Za-z]\w*$/.test(base) || /^(?:\/|\.{1,2}\/|~\/)/.test(token)
}

export function shortenPaths(text: string): string {
  return text.replace(PATH_RE, (m, base: string) => (isPath(m, base) ? base : m))
}

function inlineCode(code: string): string {
  const trimmed = code.trim()
  const shortened = shortenPaths(trimmed)
  if (shortened !== trimmed && !shortened.includes(" ")) return shortened
  return shortened.length > 0 && shortened.length <= INLINE_CODE_MAX && !shortened.includes("\n") ? shortened : "コード"
}

// Each rendered block starts with a marker naming its kind, so an intermediate message can pick its first prose.
const MARK = "\u0000"
type BlockKind = "prose" | "summary" | "heading"
const KIND_CODE: Record<BlockKind, string> = { prose: "P", summary: "S", heading: "H" }
const CODE_KIND: Record<string, BlockKind> = { P: "prose", S: "summary", H: "heading" }

const block = (kind: BlockKind) => (s: string) => (s.trim() ? `${MARK}${KIND_CODE[kind]}${s.trim()}\n` : "")
const ENDS_SENTENCE = /[。．！？!?：:、…]$/

interface Line {
  kind: BlockKind
  text: string
}

function renderLines(md: string): Line[] {
  let rows = 0
  let headRows = 0
  const rendered = Bun.markdown.render(
    md,
    {
      text: (s: string) => s,
      heading: (c: string) => block("heading")(c.trim() && !ENDS_SENTENCE.test(c.trim()) ? `${c.trim()}。` : c),
      paragraph: block("prose"),
      blockquote: (c: string) => c,
      list: (c: string) => c,
      // Loose list items already hold marked paragraphs.
      listItem: (c: string) => (c.startsWith(MARK) ? c : block("prose")(c)),
      strong: (c: string) => c,
      emphasis: (c: string) => c,
      strikethrough: (c: string) => c,
      code: (c: string, meta?: { language?: string }) => block("summary")(codeSummary(meta?.language, c)),
      codespan: (c: string) => inlineCode(c),
      link: (c: string, meta?: { href?: string }) => (c === meta?.href || /^https?:\/\//.test(c) ? "リンク" : c),
      image: (c: string) => c,
      html: () => "",
      hr: () => "\n",
      br: () => "\n",
      th: () => "",
      td: () => "",
      tr: () => {
        rows++
        return ""
      },
      thead: () => {
        headRows = rows
        return ""
      },
      tbody: () => "",
      table: () => {
        const body = rows - headRows
        rows = headRows = 0
        return block("summary")(`${body} 行の表`)
      },
    } as any,
    { tables: true, autolinks: true, strikethrough: true } as any,
  )
  const lines: Line[] = []
  // A nested list or a code block inside a list item puts a marker mid-line, so split on markers, not line starts.
  const pieces = rendered.split(MARK)
  for (const [i, piece] of pieces.entries()) {
    const kind: BlockKind = i === 0 ? "prose" : (CODE_KIND[piece[0]] ?? "prose")
    for (const raw of (i === 0 ? piece : piece.slice(1)).split("\n")) {
      const text = cleanup(shortenPaths(replaceUrls(raw))).trim()
      // Kyoko runs unpunctuated lines together, so each line becomes its own sentence.
      if (text) lines.push({ kind, text: ENDS_SENTENCE.test(text) ? text : `${text}。` })
    }
  }
  return lines
}

// Emoji go first so they cannot split a "[[" that `say` would read as an embedded command, even from stdin.
// Inline HTML reaches here as plain text.
export function cleanup(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/\[\[|\]\]/g, "")
}

export function markdownToSpeech(md: string): string {
  return renderLines(md)
    .map((l) => l.text)
    .join("\n")
}

export function firstSentence(text: string): string {
  const m = text.match(/^.*?(?:[。！？]|[!?](?=\s|$))/)
  return (m ? m[0] : text).trim()
}

// A leading heading or code block is skipped so the progress line is what gets heard.
export function messageToSpeech(md: string, kind: MessageKind): string {
  const lines = renderLines(md)
  if (kind === "final") return lines.map((l) => l.text).join("\n")
  const first = lines.find((l) => l.kind === "prose") ?? lines.find((l) => l.kind === "summary") ?? lines[0]
  return first ? firstSentence(first.text) : ""
}

export function questionToSpeech(texts: string[]): string {
  const head = texts.length === 1 ? "質問です。" : `質問が ${texts.length} つあります。`
  return [head, ...texts.map(markdownToSpeech)].join("\n")
}
