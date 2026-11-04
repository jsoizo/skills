---
name: talkback
description: Turn spoken replies on or off for the current Claude Code or Codex session (macOS). While on, a background watcher reads the agent's messages aloud with `say`, summarizing code blocks and tables and reading English in katakana. Use only when the user explicitly asks to turn speech or read-aloud on or off, or to check it, for example "talkback on", "読み上げて", "音声で返事して", "読み上げを止めて".
allowed-tools: Bash(bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts:*)
---
# talkback

## Spoken summary (applies for the rest of the session)

Once this skill has been used in a session, keep doing this in every later reply, even after talkback is turned off:

- End every reply that finishes your turn with one spoken summary line, after a blank line, in exactly this form:

  ```markdown
  [voice]: # "設定の読み込み順を直しました。テストを実行してから確認してください。"
  ```

- Also write the line at the end of the text you write right before asking the user something or handing over a plan (`AskUserQuestion`, `ExitPlanMode`). Do not write it before other tool calls.
- Write it in the language of the reply, as speech: no code, paths, URLs, Markdown lists or other Markdown. Never use `"` inside it; quote with 「」.
- Size it by one test only: the user must be able to follow the conversation and reply from the speech alone, without looking at the screen. There is no sentence limit; a longer line is fine when the reply needs it, but no longer than that test requires.
- Keep what the user needs to understand and answer: the conclusion, what changed or was found, what they must decide or check, and a reason when it affects that decision. When you ask something, say the question and each option briefly.
- Cut what only matters on screen: code, file names, exact figures and logs, step-by-step detail, and repetition. Keep a name or figure when the user needs it to answer. Rephrase for the ear instead of reading the reply as written.

The desktop app does not show the line; talkback reads it aloud instead of the reply.

## Commands

Run one command, then tell the user its result in one short line. Do not explain how talkback works unless asked.

| User intent | Command |
| --- | --- |
| Turn on (also when no argument is given) | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts on` |
| Turn on, reading replies in full | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts on --full` |
| Read only the spoken summary (the default) | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts brief` |
| Read replies in full | `bun ${CLAUDE_SKILL_DIR}/scripts/talkback.ts full` |
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
