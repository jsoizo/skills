# visual-compare

An agent skill that compares two sets of images with the same framing and builds a static HTML page to inspect them. Typical pairs are screenshots before and after a code change, a Figma design and its implementation, or two environments such as staging and production.

- Pairs images by relative path across two directories. Subdirectories become groups, for example one per viewport width.
- Counts differing pixels with [odiff](https://github.com/dmtrKovalenko/odiff) and flags pairs whose sizes differ, so a page that got taller or shorter never passes as unchanged.
- Shows each pair side by side, as an overlay with adjustable opacity, blinking between the two sides, as a diff image, or with a slider.
- Writes self-contained static files that open locally and can be shared through any static host.

Capturing the screenshots is left to the agent, because every screen needs its own setup (login, data, clicks, focus). [references/capture-example.mjs](references/capture-example.mjs) is a Playwright starting point.

## Requirements

- [Bun](https://bun.sh), tested with 1.3.11
- Network access on the first run, so that Bun can download odiff into its cache. Nothing needs to be installed by hand. The script relies on Bun's auto-install, so it stops with exit code 2 when auto-install is disabled (`bun --no-install`, or `auto = "disable"` under `[install]` in `bunfig.toml`).
- Playwright, only when you capture with the example script

## Installation

Clone the repository and symlink the skill into your agent's skills directory:

```sh
git clone https://github.com/jsoizo/skills.git
mkdir -p ~/.agents/skills ~/.claude/skills
ln -s "$PWD/skills/skills/visual-compare" ~/.agents/skills/visual-compare
ln -s ../../.agents/skills/visual-compare ~/.claude/skills/visual-compare
```

The [repository README](../../README.md#installation) also describes installing with the skills CLI.

## Usage

Ask the agent in plain words, for example "Compare the screenshots in shots/before and shots/after". In Codex you can also name the skill with `$visual-compare`. The agent captures each side when needed, runs the comparison, looks at every difference, and opens the page.

To run the comparison yourself:

```sh
bun ~/.agents/skills/visual-compare/scripts/compare.mjs \
  --a shots/before --b shots/after --out compare \
  --label-a Before --label-b After --title "Checkout screens"
```

The script prints a summary and every pair that is not identical:

```text
Compared 9 image(s): same 2, changed 3, size differs 2, only Before 1, only After 1
  changed 02-changed.png 0.50% (6px)
  size    03-taller.png 17% (240px) (40x30 vs 40x36)
  ...
Theme: default
Open: /path/to/compare/index.html
```

The script is not a pass/fail check: it exits with 0 whether or not the images differ. It exits with 1 on bad input, including when no images are found, and with 2 when Bun or odiff is unavailable.

The output directory holds:

| Path | Contents |
| --- | --- |
| `index.html` | The comparison page, for opening locally |
| `body.html` | The same page without the document skeleton, for hosts that add their own |
| `a/`, `b/`, `diff/` | Copies of both sides and the diff images |
| `files.json` | Paths of the images under `a/`, `b/` and `diff/` |
| `manifest.json` | Data behind the page: status, pixel count and size of each pair |

Each run first deletes `a/`, `b/` and `diff/` under `--out`, so point `--out` at a directory of its own. The script refuses an `--out` that overlaps an input directory.

On the page, `j` and `k` move between pairs, and so do the arrow keys while the list has focus. `1` to `5` switch between the side-by-side, overlay, blink, diff and slide views. The keys do nothing while a slider or the zoom menu has focus; click the image or the list first.

[SKILL.md](SKILL.md) describes the [options](SKILL.md#options), the [statuses](SKILL.md#statuses), the `meta.json` format for display names and notes, [theming](SKILL.md#theme), and [capturing tips](SKILL.md#capturing).

## Known limitations

- Only PNG, JPEG and WebP files are compared. A file with an uppercase extension such as `.PNG` stops the run, because odiff reads only lowercase extensions.
- On a transparent background, a white shape that moved or faded reads as unchanged. odiff compares pixels as they look over white, so capture on an opaque background.
- odiff compares the pixels at the same position, so content that moved shows up as a large difference rather than as a move. Pairs of different sizes are aligned at the top-left.

## For maintainers

### Layout

```text
visual-compare/
├── SKILL.md               # instructions the agent follows
├── scripts/compare.mjs    # pairs the images, runs odiff, writes the output directory
├── assets/template.html   # the page: markup, styles and script in one file
├── references/            # capture example and sharing notes, read on demand
├── agents/openai.yaml     # display metadata for Codex
└── tests/                 # bun test, with fixture images under fixtures/a and fixtures/b
```

### Dependency on odiff

The skill has no `package.json`. `compare.mjs` imports odiff-bin through Bun's auto-install. When neither the importing file's directory nor any parent has a `node_modules` directory, Bun accepts a version in the import specifier, downloads that version on first use, and keeps it in its global cache.

The specifier is the `ODIFF_BIN` constant at the top of `compare.mjs`. `loadOdiff()` imports it at run time instead of a static import, for two reasons:

- A project-level install puts the skill inside a JavaScript project whose root has a `node_modules` directory, and Bun turns auto-install off there. `loadOdiff()` therefore resolves the specifier from `/`.
- A failed load can exit with code 2 and a hint, as SKILL.md tells the agent to expect. `--help` and option errors are handled before the load and need no network access.

The exact version is the only pin, and on the public npm registry it is enough:

- npm never lets a published `name@version` be reused, even after it is unpublished ([npm unpublish policy](https://docs.npmjs.com/policies/unpublish)). `odiff-bin@4.5.0` can never point to a different tarball. If the version is removed from the registry, the first run fails instead.
- odiff-bin 4.5.0 has no dependencies and no install scripts. Its prebuilt binaries come from the `@odiff/<platform>` packages, which it lists as optional dependencies pinned to exactly 4.5.0. Those packages have no dependencies or scripts either.
- Each of these packages carries npm provenance that names the odiff commit it was built from. Pinning a git commit instead is not practical: CI builds the per-platform binaries and publishes them only to npm, and the repository root is a private monorepo, so installing from git would mean building odiff with Zig.
- The script does not check integrity hashes itself. It trusts the registry Bun is configured to use, so a mirror that serves a different tarball under the same version would go unnoticed.

To upgrade odiff:

1. Check the new release. odiff-bin should still have no `dependencies`, and none of `preinstall`, `install` or `postinstall` should appear in its scripts or in those of the `@odiff/*` packages:

   ```sh
   npm view odiff-bin@<version> dependencies optionalDependencies scripts
   npm view @odiff/<platform>@<version> dependencies scripts
   ```

2. Change `ODIFF_BIN` in `compare.mjs`, and the version mentioned in SKILL.md and in this README.
3. Run the tests. They expect exact pixel counts, so a change in odiff's results shows up there.

### Tests

```sh
cd skills/visual-compare
bun test
```

The tests copy `scripts/` and `assets/` into a temporary project with a named `package.json` and a `node_modules` directory, the layout of a project-level install. They use odiff from Bun's cache, so the first run needs network access.
