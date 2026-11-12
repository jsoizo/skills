# Select the current task's diff

Use existing task context and read-only Git inspection. Do not fetch, switch branches, create commits, or mutate the index merely to find a comparison.

## Identify the baseline

Inspect `git status --short`, the current branch, local refs, and recent history. Prefer, in order:

1. The base or commit explicitly supplied for this task or its PR.
2. A recorded task-start commit and file state, when reviewing only this task's edits.
3. The PR target or documented branch relationship, including a parent in a stack.
4. A locally available remote default branch from `git symbolic-ref refs/remotes/<remote>/HEAD`, or a default branch established by project configuration/history.

An upstream tracking branch may be the remote copy of the feature branch. Inspect it before treating it as the base. Branch names such as `main`, `master`, or `develop` are candidates, not proof. Use local refs and `git log --oneline --decorate` to resolve ambiguity. If no base can be established, review known task edits against `HEAD`, state that committed scope remains uncertain, and ask only when that uncertainty prevents the requested review.

## Include every state without hiding intermediate changes

For an established base, use `git merge-base HEAD <base>` to find the fork point and inspect the committed diff from that point to `HEAD`. For a task-start baseline, use that commit directly. Bound commits by the known task scope; do not include other work just because it shares the branch.

Inspect these separately, with `--no-ext-diff` and `--no-textconv` when viewing patches:

```sh
git diff --no-ext-diff --no-textconv <baseline> HEAD -- <paths>
git diff --no-ext-diff --no-textconv --cached -- <paths>
git diff --no-ext-diff --no-textconv -- <paths>
git ls-files --others --exclude-standard
```

Review relevant untracked source and test files as new files; ordinary `git diff` omits them. A combined diff against the baseline helps inspect the final result but cannot replace the separate staged and unstaged views: they can cancel each other. Review both when relevant, preserve their separation, and do not restage after edits. Inspect ignored artifacts only when the task actually changed them; avoid reading unrelated secrets or generated output.

For an unborn branch, `HEAD` and merge-base do not exist. Inspect staged additions with `git diff --cached`, unstaged changes, and relevant untracked files. With no usable history or before-state, limit review to files known to have been created or edited for this task and disclose the limitation.

Do not infer task ownership from a dirty status alone. If prior edits and current edits overlap without a reliable before-state, review the known task hunks and report uncertainty about the rest. Preserve pre-existing user changes even when they look redundant.

If all applicable views contain no task changes, stop without edits. If the user explicitly requested deslop, briefly report that no relevant diff was found; otherwise no separate report is needed.
