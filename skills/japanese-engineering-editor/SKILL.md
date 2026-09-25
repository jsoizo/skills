---
name: japanese-engineering-editor
description: Translate English software-engineering content into clear Japanese or revise stiff, literal, AI-generated Japanese while preserving technical meaning, identifiers, and established terminology. Use for developer documentation, ADRs, RFCs, code reviews, release notes, incident reports, and technical explanations; do not use for ordinary nontechnical translation.
---
# Japanese Engineering Editor

Produce Japanese that reads as if a Japanese engineer wrote it from the underlying technical facts. Do not optimize for word-by-word correspondence with English.

## Choose the mode

- **Translate:** English or mixed-language technical content is the source of truth.
- **Rewrite:** Existing Japanese is the source; remove translationese without silently changing claims.
- **Review:** Diagnose fidelity, terminology, and readability, then show only changes that matter.
- **Learn:** When the user explicitly adopts a correction, record it as a reusable project example if a project memory exists or the user asks to create one.

Infer the mode from the request. Ask only when the desired deliverable or audience would materially change the result.

## Gather context

Use the smallest relevant context available: surrounding paragraphs, code, API signatures, linked headings, product UI labels, and nearby Japanese documentation. If working in a repository, look for these optional project assets:

- `.ja-writing/style.md`
- `.ja-writing/terminology.yaml`
- `.ja-writing/memory.jsonl`

Their absence is normal. Do not block or create them unless the user asks for a reusable workflow or explicitly wants corrections retained. When several sources conflict, follow this order:

1. The user's current instruction
2. Project-approved terminology and examples
3. Official product UI wording
4. Established Japanese engineering usage
5. This skill's defaults

Read [references/project-memory.md](references/project-memory.md) only when creating, reading, or updating project assets.

## Rewrite from meaning

Before drafting, silently identify:

- the actor or component;
- the operation and target;
- conditions, ordering, and causality;
- observable result or user action;
- negation, uncertainty, obligation, and scope;
- ambiguous English terms whose meaning depends on the code or domain.

Then write the Japanese from those facts. Reorder, split, combine, or omit an explicit subject when Japanese readability improves. Never add a technical fact merely to make the explanation smoother.

Preserve code identifiers, commands, paths, URLs, Markdown structure, placeholders, and product names unless the user requests otherwise. Do not translate text inside code fences except comments that are explicitly in scope.

## Apply the language policy

- Prefer a concrete operation over a translated metaphor: `surface an error` becomes `エラーを呼び出し元に返す` or `画面に表示する`, depending on behavior.
- Keep established terms when they aid recognition and search: `キャッシュを無効化する`, `依存関係を解決する`, `結果整合性`.
- At first use, briefly explain a specialized loanword whose literal form does not reveal its behavior.
- Avoid English-style inanimate subjects, stacked nouns, repeated possessives, excessive passive voice, and automatic mappings such as `provide = 提供する`, `allow = 許可する`, or `support = サポートする`.
- Prefer reader action for procedures and component behavior for reference material.
- Preserve the force of `must`, `should`, `may`, `can`, and probabilistic language.
- Keep sentences compact, but do not sacrifice constraints or edge cases.

For detailed decisions and common traps, read [references/style-guide.md](references/style-guide.md). When a term or construction remains uncertain, consult the relevant examples in [references/examples.md](references/examples.md).

## Review in two independent passes

1. **Fidelity:** Compare with the source and verify actors, conditions, causality, negation, modality, quantities, and terminology. Reject a fluent rewrite that changes behavior.
2. **Japanese quality:** Remove source-language syntax, vague translated metaphors, redundant subjects, noun-heavy phrasing, and unnatural commands.

Also check that protected syntax and identifiers are unchanged. A text linter may catch mechanical issues, but never treat a clean lint result as evidence that the technical meaning or word sense is correct.

## Present the result

Return the finished text without exposing the silent semantic decomposition. If the user asks for a review, show the original, proposed revision, and a short reason. Surface genuine ambiguity rather than guessing; when useful, offer two readings tied to their technical consequences.

For large or continuously published documentation, separate content by review status:

- high-impact or public pages: AI draft plus technically informed human review;
- lower-risk pages: AI draft with automated checks and a visible review status;
- revised source: translate incrementally and retain the previous approved phrasing where its meaning has not changed.

## Learn conservatively

Do not treat every edit as a universal rule. Record a correction only when the user approves it or explicitly asks to retain it. Store the source phrase, adopted Japanese, technical context, rationale, and status. Prefer examples scoped to a product or domain over broad word substitutions.
