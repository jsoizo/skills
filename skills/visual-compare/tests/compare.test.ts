import { beforeAll, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const FIXTURES = path.join(import.meta.dir, "fixtures")
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "visual-compare-test-"))

// A project install puts the script under a named package.json and a node_modules, where Bun refuses a versioned import
let project: string, script: string
beforeAll(() => {
  project = tempDir()
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "project" }))
  fs.mkdirSync(path.join(project, "node_modules"))
  const skill = path.join(project, ".claude", "skills", "visual-compare")
  for (const dir of ["scripts", "assets"]) fs.cpSync(path.join(import.meta.dir, "..", dir), path.join(skill, dir), { recursive: true })
  script = path.join(skill, "scripts", "compare.mjs")
})

function run(args: string[]) {
  const p = Bun.spawnSync([process.execPath, script, ...args], { cwd: project })
  return { code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() }
}

const pngSize = (file: string) => {
  const b = fs.readFileSync(file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

const filesUnder = (root: string) => (fs.readdirSync(root, { recursive: true }) as string[])
  .filter((f) => fs.statSync(path.join(root, f)).isFile()).map((f) => f.split(path.sep).join("/"))

test("counts differing pixels per pair, sizing each diff image to the side that covers the canvas", () => {
  const out = tempDir()
  const r = run(["--a", path.join(FIXTURES, "a"), "--b", path.join(FIXTURES, "b"), "--out", out])
  expect(r.code).toBe(0)
  expect(r.stdout).toContain("Compared 9 image(s): same 2, changed 3, size differs 2, only A 1, only B 1")

  const { items } = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"))
  const wh = (x: { w: number; h: number } | null) => x && [x.w, x.h]
  expect(Object.fromEntries(items.map((it: any) => [it.path, { status: it.status, px: it.px, a: wh(it.a), b: wh(it.b), diff: wh(it.diff) }]))).toEqual({
    "01-same.png": { status: "same", px: 0, a: [40, 30], b: [40, 30], diff: null },
    "02-changed.png": { status: "changed", px: 6, a: [40, 30], b: [40, 30], diff: [40, 30] },
    "03-taller.png": { status: "size", px: 240, a: [40, 30], b: [40, 36], diff: [40, 36] },
    "04-cross.png": { status: "size", px: 540, a: [50, 30], b: [40, 36], diff: [50, 30] },
    // The jpg and webp counts are what ImageMagick's compare reported for the same files
    "05-photo.jpg": { status: "changed", px: 739, a: [40, 30], b: [40, 30], diff: [40, 30] },
    "06-photo.webp": { status: "changed", px: 1152, a: [40, 30], b: [40, 30], diff: [40, 30] },
    "07-transparent.png": { status: "same", px: 0, a: [20, 20], b: [20, 20], diff: null },
    "08-only-a.webp": { status: "only-a", px: 0, a: [30, 20], b: null, diff: null },
    "09-only-b.webp": { status: "only-b", px: 0, a: null, b: [24, 16], diff: null },
  })
  for (const it of items.filter((x: any) => x.diff)) expect(pngSize(path.join(out, it.diff.src))).toEqual([it.diff.w, it.diff.h])

  const written = ["a", "b", "diff"].flatMap((sub) => filesUnder(path.join(out, sub)).map((f) => `${sub}/${f}`))
  expect(JSON.parse(fs.readFileSync(path.join(out, "files.json"), "utf8")).sort()).toEqual(written.sort())
})

test.each([
  ["an unknown option such as the removed --fuzz", () => ["--a", path.join(FIXTURES, "a"), "--b", path.join(FIXTURES, "b"), "--fuzz", "1"]],
  ["a threshold outside 0 to 1", () => ["--a", path.join(FIXTURES, "a"), "--b", path.join(FIXTURES, "b"), "--threshold", "5"]],
  ["no images", () => ["--a", tempDir(), "--b", tempDir()]],
  ["an uppercase extension instead of skipping the file", () => {
    const a = tempDir()
    fs.copyFileSync(path.join(FIXTURES, "a", "01-same.png"), path.join(a, "same.PNG"))
    return ["--a", a, "--b", path.join(FIXTURES, "b")]
  }],
])("exits 1 without writing a page on %s", (_name, args) => {
  const out = tempDir()
  expect(run([...args(), "--out", out]).code).toBe(1)
  expect(fs.existsSync(path.join(out, "index.html"))).toBe(false)
})
