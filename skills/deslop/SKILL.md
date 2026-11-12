---
name: deslop
description: Review the current code changes after implementation and remove needless comments, defensive code, unsafe casts, and complexity while preserving behavior. Use after changing source or tests, or when explicitly requested; skip automatic use for questions, research, prose-only work, and read-only reviews.
---

# Deslop

Make the current change easy to maintain through names, types, control flow, and tests. Prefer no source comments. A smaller comment count is not the goal; preventing incorrect future changes is.

## Scope the review

- Review the changes made for the current task, including committed, staged, unstaged, and relevant untracked files. Use task-start state and the edit history to distinguish the user's pre-existing changes. Never reset, stage, unstage, or overwrite someone else's work to simplify review.
- Read [references/diff-scope.md](references/diff-scope.md) when selecting a Git comparison or when scope is uncertain. Do not assume `main` or treat every difference from a base as permission to edit it.
- Read surrounding code, callers, types, contracts, and relevant tests as needed to judge a change. Edit only task-owned changes and the minimum adjacent code needed to correct them. Report uncertain ownership or out-of-scope issues instead of changing them.
- With no task changes, finish without edits. Outside Git, compare against available before/after artifacts or the edits recorded in the task; do not turn the whole directory into a cleanup target.
- Explicit review-only requests produce findings without edits. Explicit user instructions take precedence over this skill.

## Apply the comment standard

Express behavior and contracts in code and tests first. Do not add comments that narrate What/How, explain ordinary design choices, mark decorative sections, repeat obvious KDoc/Javadoc, record change history, or restate TODOs. Being a Why comment is insufficient.

Keep or add a source comment only when **all three** conditions hold:

1. It contains important information that cannot reasonably be recovered from the code or tests.
2. Without it, a maintainer could make a specific incorrect change. Identify that change and the resulting failure.
3. An Issue, ADR, PR, specification, history entry, or test alone would not adequately prevent that mistake at the point of change.

An external ordering constraint, a workaround, an algorithm's non-obvious correctness argument, or a concurrency invariant may qualify; the category alone does not. Verify the constraint before deleting its only local explanation. If the evidence is insufficient, retain it and report the uncertainty. When a comment is necessary, name the concrete constraint and include a primary reference when useful; avoid vague claims such as "for safety" or "for compatibility."

Keep required public API contracts, generated documentation obligations, legal notices, tool directives, and type/lint suppressions unless their purpose has demonstrably disappeared or has been safely replaced. Do not mechanically classify these as explanatory comments.

If code is unclear, consider clearer names, types, control flow, or an appropriate test before adding prose. Do not introduce pointless helpers, wrappers, abstractions, or tests solely to remove a comment. Do not hide ambiguity by deleting its explanation, or copy design history into source comments when an external record suffices.

## Review the implementation

- Remove redundant guards, fallbacks, and `try/catch` on proven trusted paths. Preserve boundary validation, legitimate optional states, error propagation, recovery, cleanup, cancellation, and security checks. Prove a guard redundant from its callers and contract; its appearance alone is not evidence.
- Resolve type problems at their source instead of casting to TypeScript `any` or an equivalent unchecked type. Do not replace one unsafe escape with another.
- Simplify deep nesting with early returns when evaluation order, side effects, cleanup, and resource lifetimes remain equivalent.
- Match the surrounding code's idioms and appropriate abstraction level. Remove needless wrappers, helpers, logging, and speculative compatibility paths introduced by the task. Do not expand into unrelated cleanup or broad formatting.
- Preserve requested behavior, external contracts, and useful error handling. A behavior change or unrelated bug fix needs separate authorization; deslop is not a reason to make it.

## Verify and finish

Inspect the final diff for scope and behavioral changes. Existing lint, formatter, static analysis, and tests remain authoritative checks; this review does not replace them. If deslop edits code or tests, rerun the checks affected by those edits. Recheck the resulting changes before finishing; do not repeatedly re-review an unchanged diff.

Report only meaningful changes, validation results, and unresolved risks, briefly. A pass with no findings does not need a separate completion ceremony. If the skill or a required check cannot run, say so instead of claiming completion.
