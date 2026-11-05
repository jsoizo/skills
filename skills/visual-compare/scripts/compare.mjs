#!/usr/bin/env bun
// Pair images by relative path across two directories, count differing pixels with odiff,
// and write a self-contained comparison page (index.html for local viewing, body.html for hosts that add their own document skeleton).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `Usage: bun compare.mjs --a <dir> --b <dir> --out <dir> [options]

Options:
  --label-a <text>      Name of the first set (default: "A")
  --label-b <text>      Name of the second set (default: "B")
  --title <text>        Page title (default: "<label-a> vs <label-b>")
  --description <text>  One or two lines shown under the title
  --lang <en|ja>        UI language (default: en)
  --meta <file>         JSON with display names, notes, links and group names
  --theme <file>        CSS that overrides the color tokens
                        (default: $VISUAL_COMPARE_THEME, then ~/.config/visual-compare/theme.css,
                        then ~/.claude/visual-compare/theme.css)
  --threshold <0-1>     odiff color difference treated as equal (default: 0)`

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
const OPTIONS = new Set(["a", "b", "out", "label-a", "label-b", "title", "description", "lang", "meta", "theme", "threshold"])
const here = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith("--")) fail(`Unexpected argument: ${key}`)
    if (key === "--help") { console.log(USAGE); process.exit(0) }
    if (!OPTIONS.has(key.slice(2))) fail(`Unknown option: ${key}`)
    const value = argv[++i]
    if (value === undefined) fail(`Missing value for ${key}`)
    opts[key.slice(2)] = value
  }
  for (const required of ["a", "b", "out"]) if (!opts[required]) fail(`--${required} is required`)
  opts.threshold = Number(opts.threshold ?? 0)
  if (!(opts.threshold >= 0 && opts.threshold <= 1)) fail("--threshold must be a number from 0 to 1")
  return opts
}

function fail(message, code = 1) {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(code)
}

async function loadOdiff() {
  const hint = "Run it with `bun <skill-dir>/scripts/compare.mjs ...`. The first run downloads odiff-bin 4.5.0 into Bun's cache and needs network access."
  if (typeof Bun === "undefined") {
    console.error(`This script needs Bun. ${hint}`)
    process.exit(2)
  }
  try {
    // Bun rejects a versioned specifier under a package.json that has a name, so resolve from outside every project
    return await import(Bun.resolveSync("odiff-bin@4.5.0", "/"))
  } catch (e) {
    console.error(`Could not load odiff-bin 4.5.0: ${e.message}\n${hint}`)
    process.exit(2)
  }
}

function listImages(root) {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const full = path.join(dir, entry.name)
      const ext = path.extname(entry.name)
      if (entry.isDirectory()) walk(full)
      else if (IMAGE_EXT.has(ext)) found.push(path.relative(root, full).split(path.sep).join("/"))
      else if (IMAGE_EXT.has(ext.toLowerCase())) fail(`odiff reads only lowercase extensions. Rename ${full} to end in ${ext.toLowerCase()}.`)
    }
  }
  walk(root)
  return found
}

function sizeOf(file) {
  const b = fs.readFileSync(file)
  const size = b.readUInt32BE(0) === 0x89504e47 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
    : b.readUInt16BE(0) === 0xffd8 ? jpegSize(b)
    : b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" ? webpSize(b)
    : null
  if (!size?.w || !size?.h) throw new Error(`Could not read the image size of ${file}`)
  return size
}

function jpegSize(b) {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) { i++; continue }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

function webpSize(b) {
  const chunk = b.toString("latin1", 12, 16)
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === "VP8X") return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 }
  return null
}

async function countDiff(compare, rel, base, other, diffOut, threshold) {
  fs.mkdirSync(path.dirname(diffOut), { recursive: true })
  const result = await compare(base, other, diffOut, { threshold, diffColor: "#e60033", diffOverlay: 0.8 })
    .catch((e) => { throw new Error(`odiff failed for ${rel}: ${e.message}`) })
  if (result.match) return 0
  // A silent misread would report a changed pair as unchanged
  if (result.reason === "pixel-diff" && result.diffCount > 0) return result.diffCount
  throw new Error(`odiff returned no pixel count for ${rel}: ${JSON.stringify(result)}`)
}

// Deleting out/{a,b,diff} must never touch the inputs
function assertSeparate(out, inputs) {
  const inside = (child, parent) => {
    const rel = path.relative(parent, child)
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
  }
  for (const dir of inputs) {
    if (inside(dir, out) || inside(out, dir)) fail(`--out must not overlap an input directory: ${out} and ${dir}`)
  }
}

function defaultTitle(rel) {
  return path.basename(rel, path.extname(rel)).replace(/^\d+[-_ ]/, "")
}

function sortKey(rel) {
  const dir = path.posix.dirname(rel)
  return [dir === "." ? "" : dir, rel]
}

function resolveTheme(opt) {
  const candidates = [
    opt,
    process.env.VISUAL_COMPARE_THEME,
    path.join(os.homedir(), ".config", "visual-compare", "theme.css"),
    path.join(os.homedir(), ".claude", "visual-compare", "theme.css"),
  ]
  const file = candidates.find((f) => f && fs.existsSync(f))
  return file ? { file, css: fs.readFileSync(file, "utf8") } : null
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const odiff = await loadOdiff()
  const dirA = path.resolve(opts.a), dirB = path.resolve(opts.b), out = path.resolve(opts.out)
  for (const d of [dirA, dirB]) if (!fs.statSync(d, { throwIfNoEntry: false })?.isDirectory()) fail(`Not a directory: ${d}`)
  const meta = opts.meta ? JSON.parse(fs.readFileSync(opts.meta, "utf8")) : {}
  const labelA = opts["label-a"] || "A", labelB = opts["label-b"] || "B"
  assertSeparate(out, [dirA, dirB])

  const inA = new Set(listImages(dirA)), inB = new Set(listImages(dirB))
  if (inA.size + inB.size === 0) fail(`No images (${[...IMAGE_EXT].join(", ")}) found in ${dirA} or ${dirB}`)

  for (const sub of ["a", "b", "diff"]) fs.rmSync(path.join(out, sub), { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })

  const all = [...new Set([...inA, ...inB])].sort((x, y) => {
    const [gx, px] = sortKey(x), [gy, py] = sortKey(y)
    return gx.localeCompare(gy, undefined, { numeric: true }) || px.localeCompare(py, undefined, { numeric: true })
  })

  const copy = (from, sub, rel) => {
    const to = path.join(out, sub, rel)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    return `${sub}/${rel}`
  }

  const toItem = async (rel) => {
    const dir = path.posix.dirname(rel)
    const group = dir === "." ? "" : dir
    const info = meta.items?.[rel] || {}
    const item = {
      path: rel,
      group: meta.groups?.[group] ?? group,
      title: info.title || defaultTitle(rel),
      note: info.note || "",
      link: /^https?:\/\//i.test(info.link || "") ? info.link : "",
      a: null, b: null, diff: null, px: 0, ratio: 0,
    }
    const fileA = path.join(dirA, rel), fileB = path.join(dirB, rel)
    if (inA.has(rel)) item.a = { src: copy(fileA, "a", rel), ...sizeOf(fileA) }
    if (inB.has(rel)) item.b = { src: copy(fileB, "b", rel), ...sizeOf(fileB) }
    if (!item.a || !item.b) {
      item.status = item.a ? "only-a" : "only-b"
      return item
    }
    const sameSize = item.a.w === item.b.w && item.a.h === item.b.h
    const canvas = { w: Math.max(item.a.w, item.b.w), h: Math.max(item.a.h, item.b.h) }
    // Keep the original extension in the name so x.png and x.jpg do not share one diff file
    const diffRel = rel.toLowerCase().endsWith(".png") ? rel : `${rel}.png`
    const diffOut = path.join(out, "diff", diffRel)
    // odiff draws the diff at the first image's size, so B goes first when only B spans the whole canvas
    const bFirst = !sameSize && item.b.w === canvas.w && item.b.h === canvas.h
    item.px = await countDiff(odiff.compare, rel, bFirst ? fileB : fileA, bFirst ? fileA : fileB, diffOut, opts.threshold)
    // odiff writes no diff image for a match
    if (item.px > 0) item.diff = { src: `diff/${diffRel}`, ...sizeOf(diffOut) }
    // Share of the canvas that spans both images, so the same change reads the same at any image size
    item.ratio = item.px / (canvas.w * canvas.h)
    item.status = !sameSize ? "size" : item.px > 0 ? "changed" : "same"
    return item
  }
  const items = []
  for (const rel of all) items.push(await toItem(rel))

  // Default titles drop the extension; bring it back where two files in a group would read the same
  const seen = new Map()
  for (const it of items) seen.set(`${it.group}\0${it.title}`, (seen.get(`${it.group}\0${it.title}`) || 0) + 1)
  for (const it of items) {
    if (seen.get(`${it.group}\0${it.title}`) > 1 && !meta.items?.[it.path]?.title) it.title = `${it.title}${path.extname(it.path)}`
  }

  const theme = resolveTheme(opts.theme)
  const data = {
    title: opts.title || `${labelA} vs ${labelB}`,
    description: opts.description || "",
    lang: opts.lang === "ja" ? "ja" : "en",
    labels: { a: labelA, b: labelB },
    items,
  }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
  // Keep "</script>" inside strings from closing the inline script
  const json = JSON.stringify(data).replace(/</g, "\\u003c")
  const page = fs.readFileSync(path.join(here, "..", "assets", "template.html"), "utf8")
    .split("__TITLE__").join(escapeHtml(data.title))
    .split("/*__THEME__*/").join(theme ? theme.css : "")
    .split("__DATA__").join(json)

  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(data, null, 1))
  fs.writeFileSync(path.join(out, "body.html"), page)
  fs.writeFileSync(path.join(out, "index.html"),
    `<!doctype html>\n<html lang="${data.lang}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${page}\n</body>\n</html>\n`)
  const files = items.flatMap((it) => [it.a?.src, it.b?.src, it.diff?.src]).filter(Boolean)
  fs.writeFileSync(path.join(out, "files.json"), JSON.stringify(files))

  const count = (s) => items.filter((it) => it.status === s).length
  console.log(`Compared ${items.length} image(s): same ${count("same")}, changed ${count("changed")}, size differs ${count("size")}, only ${labelA} ${count("only-a")}, only ${labelB} ${count("only-b")}`)
  for (const it of items.filter((x) => x.status !== "same")) {
    const sizes = it.a && it.b ? ` (${it.a.w}x${it.a.h} vs ${it.b.w}x${it.b.h})` : ""
    const amount = it.status === "changed" || it.status === "size" ? ` ${(it.ratio * 100).toPrecision(2)}% (${it.px}px)` : ""
    console.log(`  ${it.status.padEnd(7)} ${it.path}${amount}${it.status === "size" ? sizes : ""}`)
  }
  console.log(`Theme: ${theme ? theme.file : "default"}`)
  console.log(`Open: ${path.join(out, "index.html")}`)
}

await main()
