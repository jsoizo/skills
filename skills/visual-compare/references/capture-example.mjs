// Example capture script. Copy it next to your work, then edit BASE, SCREENS and WIDTHS for the screens at hand.
// Run once per side (for example, before and after a change) into separate directories:
//   node capture.mjs ./shots/before
//   node capture.mjs ./shots/after
// Output layout matches what compare.mjs expects: <outDir>/<width>/<NN-name>.png
import { chromium } from "playwright"
import fs from "node:fs"

const outDir = process.argv[2]
if (!outDir) throw new Error("usage: node capture.mjs <outDir>")

const BASE = "https://example.test"
const WIDTHS = [390, 1280]

// [name, action]. Each action leaves the page in the state to capture.
// Use whatever locators work on BOTH sides being compared (the older side may lack newer test hooks or names).
const SCREENS = [
  ["top", (page) => page.goto(`${BASE}/`)],
  ["form-error", async (page) => {
    await page.goto(`${BASE}/form`)
    await page.getByRole("button", { name: "Submit" }).click()
    await page.getByRole("alert").waitFor()
  }],
  ["focus-on-checkbox", async (page) => {
    await page.goto(`${BASE}/form`)
    await page.locator("input[name=email]").focus()
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab")
      if (await page.evaluate(() => document.activeElement?.type === "checkbox")) return
    }
    throw new Error("focus never reached the checkbox")
  }],
]

// Hide things that are present on one side only or move on their own (dev tools, carets, animations)
const STABILIZE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
`

const browser = await chromium.launch()
for (const width of WIDTHS) {
  fs.mkdirSync(`${outDir}/${width}`, { recursive: true })
  for (const [i, [name, action]] of SCREENS.entries()) {
    // A fresh page per screen keeps state (storage, focus, scroll) from leaking between screens
    const page = await browser.newPage({ viewport: { width, height: 844 }, ignoreHTTPSErrors: true })
    try {
      await action(page)
      await page.waitForLoadState("networkidle")
      await page.addStyleTag({ content: STABILIZE_CSS })
      await page.waitForTimeout(500)
      const file = `${outDir}/${width}/${String(i + 1).padStart(2, "0")}-${name}.png`
      await page.screenshot({ path: file, fullPage: true })
      console.log("ok", file)
    } catch (e) {
      console.log("NG", width, name, e.message.split("\n")[0])
    }
    await page.close()
  }
}
await browser.close()
