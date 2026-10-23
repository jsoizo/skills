import { describe, expect, test } from "bun:test"
import { messageToSpeech, questionToSpeech } from "../scripts/lib/text"

describe("what a final reply sounds like", () => {
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
    expect(messageToSpeech(md, "final")).toBe(spoken)
  })
})

test.each([
  ["the first sentence", "テストを実行します。失敗したら直します。", "テストを実行します。"],
  ["the first line when unpunctuated", "1 行目\n2 行目", "1 行目。"],
  ["prose after a leading heading and code block", "## 計画\n\n```ts\na\n```\n\nまず直します。次に試します。", "まず直します。"],
  ["a list item when there is no paragraph", "- 一つ目です。続き\n- 二つ目", "一つ目です。"],
  ["the summary when there is no prose", "```sh\nls\n```", "シェル のコード 1 行。"],
])("an intermediate message is cut to %s", (_name, md, spoken) => {
  expect(messageToSpeech(md, "intermediate")).toBe(spoken)
})

test("questions are announced, then read without options", () => {
  expect(questionToSpeech(["辞書はどうしますか？"])).toBe("質問です。\n辞書はどうしますか？")
  expect(questionToSpeech(["A は？", "`B` は？"])).toBe("質問が 2 つあります。\nA は？\nB は？")
})
