# Translation and revision examples

Use only examples relevant to the current technology and sentence function. The adopted wording is a pattern, not a mandatory string.

## React and state

**English:** The hook captures the latest value without causing the effect to re-run.

**Literal:** このフックは、Effectを再実行させることなく最新の値をキャプチャします。

**Preferred:** このフックを使うと、Effectを再実行せずに最新の値を参照できます。

Reason: `capture` describes access to a value here, not a user-visible capture operation.

**English:** Derive this state during rendering instead of synchronizing it in an effect.

**Literal:** Effectで同期する代わりに、レンダリング中にこの状態を導出します。

**Preferred:** この値はEffectで同期せず、レンダリング時に既存のstateから計算します。

Reason: Explain the data relationship when `導出` would hide the actual recommendation.

## Errors and APIs

**English:** The error is surfaced to the caller.

**Literal:** エラーは呼び出し元に表面化されます。

**Preferred variants:**

- Return value: `エラーを呼び出し元に返します。`
- Exception: `呼び出し元に例外として通知します。`
- UI: `エラーを画面に表示します。`

Reason: The mechanism determines the verb.

**English:** This API allows clients to provide a custom serializer.

**Literal:** このAPIは、クライアントがカスタムシリアライザーを提供することを許可します。

**Preferred:** クライアントは、このAPIに独自のシリアライザーを指定できます。

## URLs and dependencies

**English:** The relative URL is resolved against the base URL.

**Literal:** 相対URLはベースURLに対して解決されます。

**Preferred:** 相対URLをベースURLを基準に絶対URLへ変換します。

**English:** Dependencies are resolved before the task runs.

**Preferred:** タスクを実行する前に依存関係を解決します。

Reason: `依存関係を解決する` is established usage; do not expand it merely to avoid a repeated English mapping.

## Architecture

**English:** This is an opinionated framework.

**Literal:** これは意見を持ったフレームワークです。

**Preferred:** このフレームワークは、推奨する設計や利用方法を強く規定します。

**English:** The abstraction leaks implementation details.

**Literal:** この抽象化は実装の詳細をリークします。

**Preferred:** 下位レイヤーの実装上の都合が、抽象化の外から見えてしまいます。

**English:** The service owns the lifecycle of the connection.

**Literal:** サービスは接続のライフサイクルを所有します。

**Preferred:** 接続の作成から破棄までを、このサービスが管理します。

## Data and consistency

**English:** The cache is invalidated after a successful write.

**Over-explained:** 書き込みが成功すると、保存されていた値を使用できない状態にします。

**Preferred:** 書き込みに成功すると、キャッシュを無効化します。

**English:** Reads are eventually consistent.

**Preferred first use:** 読み取りは結果整合性モデルです。更新直後には古い値が返る可能性がありますが、時間がたてば最新値に収束します。

**Preferred later use:** 読み取りは結果整合性です。

## Procedures

**English:** Review how access to protected variables works in merge request pipelines.

**Literal:** マージリクエストパイプラインで保護された変数へのアクセスがどのように機能するかをレビューします。

**Preferred:** マージリクエストパイプラインから保護変数へアクセスする仕組みを確認してください。

**English:** You can use the editor to validate the configuration.

**Literal:** エディターを使用して設定を検証することができます。

**Preferred:** エディターで設定を検証できます。

## Preserve uncertainty

**English:** This can cause the request to be retried.

**Wrongly strong:** この場合、リクエストが再試行されます。

**Preferred:** この場合、リクエストが再試行されることがあります。

**English:** The client should reuse the connection.

**Wrongly strong:** クライアントは接続を再利用する必要があります。

**Preferred:** クライアントでは、接続の再利用を推奨します。
