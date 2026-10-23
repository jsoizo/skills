#!/bin/bash
# Stops what talkback is reading, in every session, without turning speech off.
# Meant for a global keyboard shortcut (Raycast Script Command, Shortcuts.app, Karabiner).

# @raycast.schemaVersion 1
# @raycast.title Talkback Hush
# @raycast.mode silent
# @raycast.packageName talkback
# @raycast.icon 🤫
# @raycast.description 読み上げ中の音声を止める（読み上げは ON のまま）

dir="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

# Apps that run shortcuts start with a minimal PATH, so look for bun in the usual install places.
bun="$(command -v bun)"
for candidate in "$HOME/.bun/bin/bun" /opt/homebrew/bin/bun /usr/local/bin/bun "$HOME"/.asdf/installs/bun/*/bin/bun "$HOME"/.local/share/mise/installs/bun/*/bin/bun; do
  [ -n "$bun" ] && break
  [ -x "$candidate" ] && bun="$candidate"
done
if [ -z "$bun" ]; then
  echo "talkback: bun が見つかりません" >&2
  exit 2
fi

exec "$bun" "$dir/../talkback.ts" hush
