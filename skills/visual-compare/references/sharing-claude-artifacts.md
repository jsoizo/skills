# Sharing a comparison as a Claude Artifact

Read this only when the user asks to share the comparison and the environment offers Claude Artifacts.

- Publish `body.html` from the output directory, not `index.html`. The Artifact host wraps the page in its own document skeleton, and `body.html` is the page without one.
- Set `root` to the output directory and pass the image paths listed in `files.json` as supporting files, so the relative `a/`, `b/` and `diff/` paths in the page keep working.
- One publish carries at most 255 files and 64MB. Each pair uses up to three files (two screenshots and a diff), so a comparison of more than about 80 pairs goes up over several publishes to the same artifact.
- A new artifact is private. Tell the user that others cannot open it until they share it from the page's Share menu.
- To update an artifact after re-running the comparison, publish the same `body.html` path again so the link stays the same.
