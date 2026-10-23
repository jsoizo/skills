---
name: talkback
description: Turn spoken replies on or off for the current Claude Code or Codex session (macOS). While on, a background watcher reads the agent's messages aloud with `say`, summarizing code blocks and tables and reading English in katakana. Use only when the user explicitly asks to turn speech or read-aloud on or off, or to check it, for example "talkback on", "読み上げて", "音声で返事して", "読み上げを止めて".
allowed-tools: Bash(bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts:*)
---
# talkback

Run one command, then tell the user its result in one short line. Do not explain how talkback works unless asked.

| User intent | Command |
| --- | --- |
| Turn on (also when no argument is given) | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts on` |
| Turn off | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts off` |
| Stop what is being read now, keep speech on | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts hush` |
| Check | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts status` |
| Diagnose a problem | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts doctor` |

`${CLAUDE_SKILL_DIR}` is the directory that contains this file. If it is not expanded (Codex), use the absolute path of that directory instead.

Run the command exactly in this form: no `bash -lc`, no `cd`, no environment variable prefix, no pipes. Codex matches its execution rules against the command as written.

## Exit codes

- `0`: done. Report the printed line.
- `1`: runtime error. Report the message and the log path it names.
- `2`: a prerequisite is missing. Relay the printed instructions to the user as they are.

## Codex sandbox

talkback must run outside the Codex sandbox, because its watcher has to see the Codex process. When `on` exits with `2` and prints a `prefix_rule`:

1. Show the rule and the file path to the user. Do not edit `~/.codex/rules` yourself.
2. If the user wants to continue without adding the rule, run the same command again with escalated permissions (`sandbox_permissions: "require_escalated"`, justification: "talkback needs to start its watcher outside the sandbox").
