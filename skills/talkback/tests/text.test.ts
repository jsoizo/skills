import { describe, expect, test } from "bun:test"
import { markdownToSpeech, messageToSpeech, questionToSpeech } from "../scripts/lib/text"

describe("what a message sounds like", () => {
  test.each([
    ["fenced code becomes its language and line count", "前文。\n\n```ts\nconst a = 1\nconst b = 2\n```", "前文。\nTypeScript のコード 2 行。"],
    ["code without a language", "```\nls\n```", "コード 1 行。"],
    ["a table becomes its body row count", "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |", "3 行の表。"],
    ["short inline code is read", "`npm test` を実行しました。", "npm test を実行しました。"],
    ["inline code paths are shortened to the file name", "`src/components/Button.tsx` を直しました。", "Button.tsx を直しました。"],
    ["long inline code is replaced", "`aVeryLongIdentifierNameOverLimit` を消しました。", "コード を消しました。"],
    ["links keep their text, bare URLs become リンク", "[PR](https://e.com/1) と https://e.com/a を見てください。", "PR と リンク を見てください。"],
    ["paths in prose are shortened", "/Users/me/repo/README.md を更新。", "README.md を更新。"],
    ["headings and list items end as sentences", "## 変更点\n\n- 一つ目\n- 二つ目", "変更点。\n一つ目。\n二つ目。"],
    ["raw HTML is dropped", "前。\n\n<div>x</div>\n\n後。", "前。\n後。"],
    // say treats [[...]] as embedded commands even on stdin, e.g. [[volm 0]] mutes the rest.
    ["say embedded command brackets are removed", "音量 [[volm 0]] の話。", "音量 volm 0 の話。"],
    ["nested list items are read as their own sentences", "- 親\n  - 子です。", "親。\n子です。"],
    ["a code block inside a list item is summarized", "1. 手順:\n   ```sh\n   ls\n   ```", "手順:\nシェル のコード 1 行。"],
    ["dates and slash-separated words are not paths", "2026/10/23 に TODO/FIXME を見る。", "2026/10/23 に TODO/FIXME を見る。"],
    ["Japanese right after a URL is kept", "詳細は https://e.com/aを参照。", "詳細は リンクを参照。"],
    ["inline HTML tags are dropped", "a <br> b", "a  b。"],
    ["emoji are removed", "完了しました 🎉✅", "完了しました。"],
  ])("%s", (_name, md, spoken) => {
    expect(markdownToSpeech(md)).toBe(spoken)
  })
})

describe("how much of a message is read", () => {
  const voiced = '結論です。理由は長いです。\n\n[voice]: # "`npm test` が通りました。"'
  test.each([
    ["brief: the spoken summary replaces the body", voiced, true, "brief", "npm test が通りました。"],
    ["brief: a summary on an intermediate message is read too", voiced, false, "brief", "npm test が通りました。"],
    ["brief: only the last line is the summary", '本文。\n\n[voice]: # "古い要約。"\n\n[voice]: # "新しい要約。"', true, "brief", "新しい要約。"],
    ["brief: an example in a code block is not the summary", '書式です。\n\n```markdown\n[voice]: # "例。"\n```', true, "brief", "書式です。\nMarkdown のコード 1 行。"],
    ["brief: a stray double quote inside the summary still matches", '本文。\n\n[voice]: # "「a" を直しました。"', true, "brief", "「a\" を直しました。"],
    ["brief: inline code with ? or ! does not end the first sentence", "`foo?.bar` と `a != b` を直します。次に進みます。", false, "brief", "foo?.bar と a != b を直します。"],
    ["brief: an English sentence ends at a period before a space", "Checking the config. Then running tests.", false, "brief", "Checking the config."],
    ["brief: an intermediate message without a summary is cut to its first sentence", "調べます。詳しく見ます。\n\n- 項目", false, "brief", "調べます。"],
    ["brief: a final message without a summary is read in full", "結論です。理由です。", true, "brief", "結論です。理由です。"],
    ["full: the body is read and the summary is not", voiced, true, "full", "結論です。理由は長いです。"],
    // Inside a paragraph the line is not a link definition, so Markdown would read it out.
    ["full: a summary written inside a paragraph is not read out", '本文です。\n[voice]: # "要約。"', true, "full", "本文です。"],
  ] as const)("%s", (_name, md, final, mode, spoken) => {
    expect(messageToSpeech(md, { final, mode })).toBe(spoken)
  })
})

test("questions are announced, then read with their option labels", () => {
  expect(questionToSpeech([{ text: "辞書はどうしますか？", options: ["作る", "使わない"] }])).toBe("質問です。\n辞書はどうしますか？\n選択肢は、作る、使わない。")
  expect(questionToSpeech([{ text: "A は？", options: [] }, { text: "`B` は？", options: [] }])).toBe("質問が 2 つあります。\nA は？\nB は？")
  expect(questionToSpeech([{ text: "進めますか？", options: ["はい (Recommended)", "いいえ。", "<none>"] }])).toBe("質問です。\n進めますか？\n選択肢は、はい（推奨）、いいえ。")
})
