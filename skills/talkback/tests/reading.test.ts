import { expect, test } from "bun:test"
import { loadDictionaries, SayReadingProfile } from "../scripts/lib/reading"

// Uses the bundled dictionaries: the readings users hear are the contract.
const profile = new SayReadingProfile(loadDictionaries())

test.each([
  ["camelCase identifiers", "useEffect に userId を足す", "ユーズエフェクト に ユーザーアイディー を足す"],
  ["file names spell short extensions", "Button.tsx", "ボタン ティーエスエックス"],
  ["overrides win over kanalizer mistakes", "API の button", "エーピーアイ の ボタン"],
  ["terms missing from kanalizer come from overrides", "README.md と package.json", "リードミー エムディー と パッケージ ジェイソン"],
  ["short all-caps words are spelled, known longer ones are words", "PR と HEAD", "ピーアール と ヘッド"],
  ["single letters are spelled", "-i を付ける", "-アイ を付ける"],
  ["numbers and versions stay as they are", "Bun 1.3.11 と v2", "バン 1.3.11 と ブイ2"],
])("%s", (_name, text, spoken) => {
  expect(profile.toSegments(text)).toEqual([{ role: "ja", text: spoken }])
})

test("three or more English words are one English sentence, not word-by-word voice switches", () => {
  expect(profile.toSegments("Use the default config で動きます")).toEqual([
    { role: "en", text: "Use the default config" },
    { role: "ja", text: " で動きます" },
  ])
})

test("only known extensions are spelled, so a property after a dot is read as a word", () => {
  expect(profile.toSegments("React.memo")).toEqual([{ role: "ja", text: "リアクト メモ" }])
})

test("a run with any unknown word goes to the English voice as a whole", () => {
  expect(profile.toSegments("hoikuenSettings を変更")).toEqual([
    { role: "en", text: "hoikuen Settings" },
    { role: "ja", text: " を変更" },
  ])
})
