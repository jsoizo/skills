#!/usr/bin/env node
// Pair images by relative path across two directories, count differing pixels with ImageMagick,
// and write a self-contained comparison page (index.html for local viewing, body.html for hosts that add their own document skeleton).
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `Usage: node compare.mjs --a <dir> --b <dir> --out <dir> [options]

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
  --fuzz <percent>      Color distance treated as equal (default: 0)`

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"])
const here = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith("--")) fail(`Unexpected argument: ${key}`)
    if (key === "--help") { console.log(USAGE); process.exit(0) }
    const value = argv[++i]
    if (value === undefined) fail(`Missing value for ${key}`)
    opts[key.slice(2)] = value
  }
  for (const required of ["a", "b", "out"]) if (!opts[required]) fail(`--${required} is required`)
  return opts
}

function fail(message, code = 1) {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(code)
}

function requireImageMagick() {
  const probe = spawnSync("magick", ["-version"], { encoding: "utf8" })
  if (probe.error || probe.status !== 0) {
    console.error("ImageMagick 7 (the `magick` command) was not found. Install it (e.g. `brew install imagemagick`) and run again.")
    process.exit(2)
  }
}

function listImages(root) {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) found.push(path.relative(root, full).split(path.sep).join("/"))
    }
  }
  walk(root)
  return found
}

function sizeOf(file) {
  const [w, h] = execFileSync("magick", ["identify", "-format", "%w %h", `${file}[0]`], { encoding: "utf8" }).trim().split(" ").map(Number)
  return { w, h }
}

// Pad to a shared canvas from the top-left so a height change still counts as a difference
function padded(file, size, tmpDir) {
  const out = path.join(tmpDir, `${Math.random().toString(36).slice(2)}.png`)
  execFileSync("magick", [file, "-background", "none", "-gravity", "northwest", "-extent", `${size.w}x${size.h}`, out])
  return out
}

function countDiff(a, b, diffOut, fuzz) {
  fs.mkdirSync(path.dirname(diffOut), { recursive: true })
  const result = spawnSync("magick", [
    "compare", "-metric", "AE", "-fuzz", `${fuzz}%`,
    "-highlight-color", "#e60033", "-lowlight-color", "rgba(255,255,255,0.8)",
    a, b, diffOut,
  ], { encoding: "utf8" })
  // Exit 1 only means "images differ"; 2 is a real error
  if (result.status === 2 || result.error) throw new Error(`magick compare failed for ${a}: ${result.stderr || result.error}`)
  // ImageMagick 7.1.1+ prints "<scaled> (<pixels>)"; older versions print the pixel count alone.
  // Warnings may precede the metric, so read the last line only.
  const last = result.stderr.trim().split("\n").pop().trim()
  const m = last.match(/^([\d.e+-]+)(?:\s*\(([\d.e+-]+)\))?$/)
  const px = m ? Math.round(Number(m[2] ?? m[1])) : NaN
  // A silent misread would report a changed pair as unchanged
  if (!Number.isFinite(px) || (result.status === 1 && px === 0)) {
    throw new Error(`Could not read the differing pixel count for ${a} (exit ${result.status}): ${result.stderr.trim()}`)
  }
  return px
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

function main() {
  const opts = parseArgs(process.argv.slice(2))
  requireImageMagick()
  const dirA = path.resolve(opts.a), dirB = path.resolve(opts.b), out = path.resolve(opts.out)
  for (const d of [dirA, dirB]) if (!fs.statSync(d, { throwIfNoEntry: false })?.isDirectory()) fail(`Not a directory: ${d}`)
  const meta = opts.meta ? JSON.parse(fs.readFileSync(opts.meta, "utf8")) : {}
  const labelA = opts["label-a"] || "A", labelB = opts["label-b"] || "B"
  const fuzz = Number(opts.fuzz || 0)
  assertSeparate(out, [dirA, dirB])

  const inA = new Set(listImages(dirA)), inB = new Set(listImages(dirB))
  if (inA.size + inB.size === 0) fail(`No images (${[...IMAGE_EXT].join(", ")}) found in ${dirA} or ${dirB}`)

  for (const sub of ["a", "b", "diff"]) fs.rmSync(path.join(out, sub), { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "visual-compare-"))

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

  const items = all.map((rel) => {
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
    const cmpA = sameSize ? fileA : padded(fileA, canvas, tmpDir)
    const cmpB = sameSize ? fileB : padded(fileB, canvas, tmpDir)
    item.px = countDiff(cmpA, cmpB, path.join(out, "diff", diffRel), fuzz)
    item.diff = { src: `diff/${diffRel}`, ...canvas }
    // Share of the compared (padded) area, so the same change reads the same at any image size
    item.ratio = item.px / (canvas.w * canvas.h)
    item.status = !sameSize ? "size" : item.px > 0 ? "changed" : "same"
    return item
  })
  fs.rmSync(tmpDir, { recursive: true, force: true })

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

main()
