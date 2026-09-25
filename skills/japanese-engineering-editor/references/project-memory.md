# Optional project memory

Use project memory only for an ongoing repository or documentation set. It bootstraps from approved corrections; an initial dictionary is not required.

## Files

```text
.ja-writing/
├── style.md
├── terminology.yaml
└── memory.jsonl
```

Create only the files that have useful content. Do not add empty scaffolding.

## `style.md`

Record project-specific decisions that apply broadly, such as audience, tone, product naming, UI-label policy, and whether specialist terms need a first-use explanation. Avoid copying generic rules from this skill.

## `terminology.yaml`

Store terms by sense rather than spelling alone.

```yaml
- source: resolve
  domain: URL
  sense: convert a relative reference using a base URL
  preferred: ベースURLを基準に絶対URLへ変換する
  avoid:
    - ベースURLに対して解決する
  status: approved
  source_note: approved in docs review

- source: invalidate
  domain: cache
  sense: make a cached entry unusable or stale
  preferred: キャッシュを無効化する
  status: approved
```

Required fields are `source`, `domain`, `sense`, `preferred`, and `status`. Add an avoided form only when it has actually caused confusion.

## `memory.jsonl`

Store complete examples when sentence structure or context matters more than a single term.

```json
{"source":"The error is surfaced to the caller.","target":"エラーを呼び出し元に返します。","context":"HTTP client; error return value","reason":"surface describes propagation, not UI display","status":"approved"}
```

Keep one JSON object per line with `source`, `target`, `context`, `reason`, and `status`.

## Bootstrap workflow

1. Start with the skill defaults and nearby approved Japanese documentation.
2. When the user corrects or approves a translation, decide whether it is a term decision or a sentence-level example.
3. Record only the narrowest reusable rule.
4. On future work, retrieve examples with the same domain, operation, and document genre.
5. If a new correction conflicts with an approved entry, surface the conflict instead of overwriting it silently.

Suggested statuses are `candidate`, `approved`, and `deprecated`. AI-generated wording must remain `candidate` until the user or designated reviewer approves it.

## Maintenance

- Keep provenance in `source_note` or the example's `reason`.
- Deprecate rather than delete terminology that may still appear in older documents.
- Do not generalize a product-specific label into a language-wide rule.
- Prefer a few high-quality, semantically close examples over a large undifferentiated corpus.
