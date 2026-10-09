---
name: visual-compare
description: Compare two sets of screenshots or images that share the same framing (before/after a code change, Figma design vs implementation, one environment vs another) and build an HTML page to inspect them side by side, as a slider, overlay, blink, or pixel diff. Counts differing pixels with ImageMagick and flags size changes that overlap-only tools miss. Use when asked to check a UI change for visual regressions, show before/after screenshots, compare an implementation with Figma, or produce a visual diff report.
---
# Visual Compare

Build a comparison page from two directories of images. The skill owns the comparison and the page. Capturing the images is the caller's job, because every screen needs its own setup (login, data, clicks, focus).

## Workflow

1. **Decide the two sides.** Name them for the reader (`Before` / `After`, `Figma` / `Implementation`, `stg` / `prd`). Settle what "same framing" means for this case: viewport width, full page or viewport only, and the state each screen should be in. Ask the user only when the sides or the screens are unclear.
2. **Capture each side** into its own directory, one file per screen, with the same relative path on both sides. Subdirectories become groups in the page (for example one per viewport width). See [Capturing](#capturing).
3. **Run the comparison:**

   ```sh
   node <skill-dir>/scripts/compare.mjs --a shots/before --b shots/after --out compare \
     --label-a Before --label-b After --title "Checkout screens" --lang en
   ```

   It requires ImageMagick 7 (`magick`). If the script exits with code 2 because `magick` is missing, stop and ask the user how to proceed (for example `brew install imagemagick`). Do not install it or switch tools without asking.
4. **Check every non-matching item** before reporting. Look at the diff image. Re-capture once and compare again when a difference looks unrelated to the change: rendering noise of a few pixels does happen and disappears on a second capture. For differences that are intended, add a note in `meta.json` and rerun so the page explains them.
5. **Open the page locally** in a browser (`open compare/index.html` on macOS, `xdg-open` on Linux). Report the summary line the script prints and what each remaining difference is.
6. **Share only when asked.** The output directory is self-contained static files: `index.html`, the images under `a/`, `b/` and `diff/`, and `files.json` listing those images. Share it through whatever the user or the agent's environment provides (a static host, an archive, an agent-specific publishing feature). `body.html` is the same page without the document skeleton, for hosts that wrap pages in their own. Screenshots can contain real data: check them before sharing, and tell the user who will be able to see the result.
   - Claude Artifacts: read [references/sharing-claude-artifacts.md](references/sharing-claude-artifacts.md) first.

The script refuses an `--out` directory that overlaps either input directory, because it clears `a/`, `b/` and `diff/` under `--out` on every run. It exits with 1 when no images are found, so a wrong path never reads as "everything matches".

## Options

| Option | Purpose |
| --- | --- |
| `--label-a`, `--label-b` | Names of the two sides, used throughout the page |
| `--title`, `--description` | Page heading and a short lead (for example the commits or URLs compared) |
| `--lang en\|ja` | UI language of the page (default `en`) |
| `--meta <file>` | Display names, notes, links and group names (format below) |
| `--theme <file>` | CSS that overrides the color tokens |
| `--fuzz <percent>` | Color distance treated as equal; keep `0` for regression checks |

`meta.json`:

```json
{
  "groups": { "390": "Width 390px", "1280": "Width 1280px" },
  "items": {
    "390/05-consent-focus.png": {
      "title": "Consent checkbox focused",
      "note": "Focus ring added on purpose",
      "link": "https://www.figma.com/design/<file>?node-id=1-2"
    }
  }
}
```

Without `meta.json`, an item's title is its file name without the extension and a leading `NN-` ordering prefix.

## Statuses

| Status | Meaning |
| --- | --- |
| `same` | Same size and no differing pixels |
| `changed` | Same size, some pixels differ. The page shows the share of the compared area (a non-zero share is never rounded to 0%; below 0.01% it reads `<0.01%`) with the pixel count next to it |
| `size` | Sizes differ. Both images are padded from the top-left to the larger size before counting, so a page that got shorter or taller never passes as unchanged |
| `only-a`, `only-b` | The image exists on one side only |

Sort order follows the relative path with numeric collation, so prefix file names with `01-`, `02-` to control the order.

## Theme

The page defines every color as a CSS custom property on `:root` (`--bg`, `--panel`, `--border`, `--border-strong`, `--hover`, `--text`, `--sub`, `--accent`, `--accent-bg`, `--on-accent`, `--ok`, `--ok-bg`, `--ng`, `--ng-bg`, `--warn`, `--warn-bg`, `--font`, `--mono`), with light values and a dark override. A theme file redefines any of them, including inside the same dark-mode selectors (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and `:root[data-theme="dark"]`). The script uses the first theme it finds: `--theme`, then `$VISUAL_COMPARE_THEME`, then `~/.config/visual-compare/theme.css`, then `~/.claude/visual-compare/theme.css`. Keep organization-specific themes outside this repository.

## Capturing

[references/capture-example.mjs](references/capture-example.mjs) is a starting point for Playwright. Copy it and write the screens for the case at hand; keep it small rather than building a framework. If Playwright reports a missing browser after `npm i playwright`, run `npx playwright install chromium` instead of pointing `executablePath` at another cached build, so the capture script keeps working elsewhere.

- Capture both sides with the same script, viewport, scroll mode (`fullPage`), waits and data. Differences in any of these show up as false diffs.
- Use locators that exist on both sides. When comparing across a refactor, the older side may lack the names or test hooks the newer side has, so prefer DOM structure or visible text that both share.
- Hide what only one side renders or what moves on its own: dev tools overlays, animations, carets, clocks.
- **When one side cannot be produced at the same size:** some sources cap or fix their output (an export tool limited to a maximum width, a fixed scale, a device-sized screenshot). Scale the larger side down to the smaller side's size, never the smaller side up, because upscaling invents pixels and every edge then reads as a difference. Apply the same resize to every image on that side, and say in `--description` which side was resized and from what size.
- **When a side cannot be obtained with the tools at hand** (no connector or exporter is available, it needs authentication, it lives in another app): stop and ask the user, for example to export the images themselves or to connect the tool. Do not work around it by driving another application or calling a local service directly; that changes state the user did not ask you to touch.
- **Keep everything in one working directory:** intermediate screenshots, scripts and logs go under the working or output directory, not `/tmp` or the inputs. If a capture saves login state (cookies, storage state files), delete it when done and mention it in the report.
- **Two versions of a running app:** prefer a `git worktree` of the other commit with its own dev server, which never touches the user's working tree. When only the running server can be used (shared hosts, proxies, seeded data), swapping the UI source in place is acceptable under these conditions: `git checkout <commit> -- <path>` and `git checkout HEAD -- <path>` silently overwrite uncommitted edits, so first confirm `git status --porcelain -- <path>` is empty. If it is not, ask the user before stashing (`git stash push -- <path>`), and never compare against uncommitted work this way. After capturing, restore and confirm `git diff --quiet HEAD -- <path>`. Either way, confirm that the older side was really served, for example by checking that an expected difference appears.
- **Design tool vs implementation:** export frames at the implementation's viewport width (scale = viewport width / frame width). Content and heights rarely match, so expect `changed` or `size` and treat the page as a visual aid rather than a pass/fail check: report layout, color and wording differences, and keep them apart from differences in sample data. Put the frame URL in `meta.json` as `link`.
- **Environments:** log in and seed comparable data on both, and mask values that legitimately differ (dates, IDs) before comparing.
