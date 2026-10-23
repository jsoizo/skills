# talkback

Claude Code や Codex の返答を、macOS の音声で読み上げるスキルである。読み上げは、セッションごとに ON/OFF する。ON にしたセッションだけが読み上げの対象になり、ほかのセッションには影響しない。

- エージェントの作業中から、書かれた文を順に読み上げる。turn の終わりまで待たない。
- コードブロックと表は、中身を読まずに「TypeScript のコード 12 行」「3 行の表」のように種類と量だけを読む。
- 英単語や識別子はカタカナに直して読む（`useEffect` →「ユーズエフェクト」）。

状態: MVP。Claude Code（デスクトップアプリと CLI）で動作を確認した。Codex は、テスト用の偽の環境でしか確認していない。

## 必要なもの

- macOS（`say` と `afplay` を使う）
- [Bun](https://bun.sh)。組み込みの `Bun.markdown` を使う（Bun 1.3.11 で確認した）
- 音声 Kyoko（日本語）と Samantha（英語）。どちらも macOS に標準で入っている

## インストール

リポジトリを clone し、スキルのディレクトリへのシンボリックリンクを作る。

```sh
git clone https://github.com/jsoizo/skills.git
mkdir -p ~/.agents/skills ~/.claude/skills
ln -s "$PWD/skills/skills/talkback" ~/.agents/skills/talkback
ln -s ../../.agents/skills/talkback ~/.claude/skills/talkback
```

Codex で使う場合は、あわせて [Codex で使う準備](#codex-で使う準備) を行う。

## 使い方

| 操作 | Claude Code | Codex |
| --- | --- | --- |
| 読み上げを ON にする | `/talkback on` | `$talkback on` |
| 読み上げを OFF にする | `/talkback off` | `$talkback off` |
| 今の読み上げだけを止める（ON のまま） | `/talkback hush` または [ショートカット](#ショートカットで読み上げを止める) | `$talkback hush` または ショートカット |
| 状態を確認する | `/talkback status` | `$talkback status` |
| 動かない原因を調べる | `/talkback doctor` | `$talkback doctor` |

ON にすると、その返答から読み上げが始まる。エージェントのプロセス（セッション）を終了すると、読み上げも自動で終わる。

## 読み上げの規則

| 書かれたもの | 読み方 |
| --- | --- |
| 本文、見出し、リスト | すべて読む |
| コードブロック | 「TypeScript のコード 12 行」のように、言語と行数だけを読む |
| 表 | 「3 行の表」のように、行数だけを読む |
| インラインコード | パスはファイル名だけを読む（`src/a/Button.tsx` →「ボタン ティーエスエックス」）。それ以外は短ければ中身を読み、長ければ「コード」と読む |
| リンクと URL | リンクの文字列だけを読む。URL は「リンク」と読む |
| 英単語、識別子 | カタカナに直して読む。辞書で直せない語と、3 語以上の英文は英語の声（Samantha）で読む |
| ユーザーへの質問 | 「質問です。」（複数なら「質問が N つあります。」）と言ってから質問文を読む。選択肢は読まない |
| 絵文字、HTML タグ | 読まない |

読み上げは、次のときに止まる。止まったときに読み終えていなかった分は捨てる。

- そのセッションで、新しいプロンプトやスラッシュコマンドを送ったとき
- Esc で turn を中断したとき（デスクトップアプリでは止まらないことがある。下を参照）
- `/talkback off` を実行したとき
- `hush` を実行したとき。読み上げは ON のままで、次の返答はまた読む

`!` で実行したシェルコマンドでは止まらない。Claude Code のデスクトップアプリでは、Esc で中断しても止まらないことがある。Esc での中断が、transcript に記録されないことがあるからである。読み上げだけを止めたいときは `hush` を使う。

## ショートカットで読み上げを止める

`hush` は、エージェントのセッションの外からでも実行できる。キーボードショートカットに割り当てておくと、どのアプリを前面にしていても読み上げを止められる。止まるのは、動いているすべてのセッションの読み上げである。

ショートカットから呼ぶためのスクリプトが [scripts/raycast/hush.sh](scripts/raycast/hush.sh) にある。

**Raycast の場合**

1. Raycast の設定で Extensions → Script Commands → Add Directories を開き、`~/.agents/skills/talkback/scripts/raycast` を追加する。
2. 一覧に出る「Talkback Hush」を選び、Hotkey に好きなキーを割り当てる。

**ショートカット.app の場合**

「シェルスクリプトを実行」アクションに `~/.agents/skills/talkback/scripts/raycast/hush.sh` と書き、作ったショートカットにキーボードショートカットを割り当てる。

複数のセッションで ON にしたときは、発話が重ならないよう順番に読む。前と違うセッションの文を読むときは、先にプロジェクト名（セッションを始めたディレクトリの名前）を読む。

## 設定

次の環境変数で、声と速度を変えられる。

| 変数 | 既定値 | 内容 |
| --- | --- | --- |
| `TALKBACK_VOICE_JA` | `Kyoko` | 日本語の声 |
| `TALKBACK_VOICE_EN` | `Samantha` | 英語の声 |
| `TALKBACK_RATE` | なし（声の標準速度） | 読み上げ速度（`say -r` に渡す値。1 分あたりの語数） |

環境変数は、エージェントを起動する環境に設定する。スキルのコマンドの前に `TALKBACK_RATE=200` と付ける方法は使えない。Codex の実行ルールが、コマンドの形で照合されるからである。

- Claude Code: `~/.claude/settings.json` の `env` に書く

  ```json
  { "env": { "TALKBACK_RATE": "200" } }
  ```

- Codex やターミナルから起動するエージェント: シェルの設定ファイルで `export TALKBACK_RATE=200` とする

値は ON にした時点で読み込まれる。読み上げ中に変えた場合は、`off` → `on` で反映される。

## Codex で使う準備

talkback は、Codex の sandbox の外で動かす必要がある。sandbox の中からは、Codex のプロセスが生きているかを確かめられないからである。

`~/.codex/rules/talkback.rules` に次のルールを書くと、Codex は承認を求めずに sandbox の外で talkback を実行する。パスは、インストールした `talkback.ts` の絶対パスに置き換える。

```starlark
prefix_rule(
    pattern = ["bun", "/Users/<user>/.agents/skills/talkback/scripts/talkback.ts"],
    decision = "allow",
    justification = "talkback: 読み上げの監視プロセスを sandbox の外で起動・停止する",
)
```

ルールがない状態で `$talkback on` を実行すると、必要なルールと書き込み先が表示される。ルールを足さずに、その場限りの承認で ON にすることもできる。

## うまく動かないとき

`/talkback doctor`（Codex では `$talkback doctor`）を実行すると、前提条件を順に確認し、直すべき点を表示する。確認する項目は、`say` と `afplay`、2 つの音声、`Bun.markdown`、辞書、セッションとエージェントのプロセスの検出、transcript の解析、状態ディレクトリへの書き込み、Codex の実行ルールである。

監視プロセスのログは `~/.local/state/talkback/logs/<セッション ID>.log` にある。ログには、読み上げた本文は書かれない。

## 既知の制約

- Claude Code のデスクトップアプリは、ツールを呼ぶ前に書いた文を記録に残さないことが多い。そのため、作業中の文は一部しか読まれない。最終的な返答は読まれる。
- talkback は、公開されていない transcript の形式を読んでいる。Claude Code や Codex の更新で、読み上げが止まる可能性がある。
- ローマ字の識別子（`hoikuen` など）は英語の声で読むので、正しく読めない。
- macOS 以外では動かない。

## 保守する人向けの文書

- [docs/architecture.md](docs/architecture.md): 仕組み。処理の流れ、transcript の読み方、依存している外部の形式とその確認方法
- [docs/decisions.md](docs/decisions.md): 設計の判断と理由、採用しなかった案、リスク、未確認の項目

テストは `bun test` で実行する。`say` と `afplay` は偽物に置き換えるので、音は鳴らない。

## 出典

英語の読みには、VOICEVOX の [kanalizer-dataset](https://huggingface.co/datasets/VOICEVOX/kanalizer-dataset)（MIT License、Copyright (c) 2025 VOICEVOX）を変換して同梱している。詳細は [assets/katakana/kanalizer.LICENSE](assets/katakana/kanalizer.LICENSE) にある。
