# Japanese software-engineering style guide

Use this guide for translation or substantive rewriting. The objective is fast and accurate comprehension by Japanese engineers, not the elimination of English loanwords.

## Information structure

- Put the condition before the result when the condition determines how the sentence is read.
- State the component or reader action once; omit repeated subjects when they remain obvious.
- Split a sentence when it contains more than one independent condition or consequence.
- Prefer chronological order for procedures and causal order for explanations.
- In reference documentation, lead with what the API does. In tutorials, lead with what the reader should do.
- Do not stage a claim as a rhetorical question and its answer (`答えは「直す」です`, `〜か？ はい、〜です`). State the claim directly, with a concrete subject: `同期処理は直します`.
- Do not open with a preview of the structure (`以下では…を説明します`, `問いが 2 つあります`, `この節では…を扱います`). Start with the content or the conclusion.
- Do not use a bare demonstrative (`ここ`, `これ`, `それ`) as the topic of a sentence unless nearby text makes its referent unambiguous. Name the referent instead, for example `この判断は`. `この` + noun already names its referent.
- Use the same sentence frame for parallel claims, with each item's subject as the topic (`同期処理は…。WebFlux を続けるかどうかは…。`). Do not frame parallel items as questions (`1 つ目は…かどうかです。`). When the items differ in status, mark the contrast with the topics themselves or with `前者は…／後者は…`, not with `これは…／こちらは…`.
- Use `どちら` or `両方` only after the alternatives have been named in the text. If the source does not name the alternatives, do not invent them; rephrase instead, for example `続けるかどうかに関係なく`.
- When splitting a long sentence, keep the logical link. A sentence that gives the reason for the previous one ends with `〜からです`.

## Terminology decisions

Classify a term before choosing its Japanese form.

1. **Established term:** retain the conventional form, such as `キャッシュを無効化する`.
2. **Useful loanword:** retain it and explain its behavior on first use, such as `ハイドレーション`.
3. **Contextual verb:** translate the actual operation, not the dictionary headword.
4. **English metaphor:** replace it with the concrete technical consequence.
5. **Product label or identifier:** match the official UI or source exactly.

Do not create a global mapping for polysemous words. Scope entries by technology and sense. For example, `resolve` may mean dependency resolution, DNS lookup, URL conversion, promise settlement, or problem resolution.

## Frequent translationese patterns

| Pattern | Usually weak | Prefer |
| --- | --- | --- |
| allows you to | ～することを許可します | ～できます／～するには |
| provides | ～を提供します | ～があります／～を返します／～を利用できます |
| is responsible for | ～に責任があります | ～を担当します／～を実行します |
| is used to | ～するために使用されます | ～に使います／～します |
| against | ～に対して | 文脈に応じて「基準に」「照合して」「接続して」 |
| surface | 表面化する | 返す／通知する／表示する |
| opinionated | 意見を持った | 設計や利用方法を強く規定する |
| abstraction leaks | 抽象化がリークする | 下位実装の都合が利用側から見える |
| early stage | アーリーステージ | 前半のステージ／先に実行されるステージ |
| review how ... works | ～がどう機能するかレビューする | ～の仕組みを確認する |

These are diagnostics, not blind substitutions. `提供する`, `サポートする`, and passive voice are acceptable when they express the intended meaning naturally.

## Modality and precision

- `must` normally expresses a requirement: `～する必要があります` or `～しなければなりません`.
- `should` normally expresses a recommendation, not a requirement.
- `may` can express permission or possibility; determine which from context.
- Preserve `only`, `unless`, `except`, default behavior, version boundaries, and failure conditions.
- Do not replace a precise mechanism with an easier but broader claim.

## Genre adjustments

- **API reference:** concise, declarative, terminology-stable.
- **Tutorial:** imperative or reader-centered, ordered by action.
- **ADR/RFC:** retain alternatives, trade-offs, uncertainty, and decision status.
- **Incident report:** distinguish observed fact, hypothesis, cause, and remediation.
- **Code review:** state the risk and requested change directly; avoid unnecessarily authoritative wording.
- **Release notes:** state what changed, who is affected, and whether action is required.

## Final checks

- Could an engineer predict the behavior from the Japanese alone?
- Would searching the Japanese term lead to the expected ecosystem terminology?
- Did a natural rewrite weaken a condition or requirement?
- Does every pronoun or omitted subject still have one plausible referent?
- Do parallel items share one sentence pattern, and does every `どちら` or `両方` point to alternatives already named?
- Are code and document syntax byte-for-byte intact where required?
