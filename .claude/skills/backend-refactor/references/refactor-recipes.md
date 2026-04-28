# Refactor Recipes (backend)

backend のリファクタで頻出の「安全な進め方」まとめ。

## Recipe: Handler から DB 操作を切り出す

目的: handler を「HTTP 入出力」に寄せ、DB/ドメイン処理を service に集約する。

手順:

1. handler 内の SQLx 部分を最小単位で選ぶ（まず 1 クエリ）
2. `backend/src/services/<domain>.rs` に関数を作る
3. handler から service を呼ぶように置き換える
4. `cargo test`（最低でも `cargo check`）で都度確認する

関数シグネチャ指針:

- `pool: &PgPool` を受け取る
- 認証が必要な場合は `user_id: Uuid` を明示的に渡す
- `Result<T, sqlx::Error>` にして handler 側で `ApiError` に寄せるか、service 側で `ApiError` を返すかを決めて統一する

## Recipe: request のバリデーションを追加する

目的: `Json<T>` の parse と `validator` の検証を標準化する。

手順:

1. request struct を `backend/src/models/<domain>.rs` に置く
2. `#[derive(Validate)]` を付けて、フィールドに `#[validate(...)]` を付ける
3. handler を `ValidatedJson<T>` に置き換える（`backend/src/extractors/validated_json.rs`）
4. バリデーションエラーが `ApiError::ValidationError` に落ちることを確認する

## Recipe: 大きい module を分割する

目的: 変更単位を小さくして見通しを良くする。

手順:

1. 分割先のファイルを追加する（例: `backend/src/handlers/<new>.rs`）
2. registry に `pub mod <new>;` を追加する（例: `backend/src/handlers.rs`）
3. 依存の少ない型/関数から順に移動する
4. move ごとに `cargo check` を通す

## Recipe: ApiError を拡張する

目的: エラー契約を保ったまま、責務に沿ったエラー表現を増やす。

手順:

1. `backend/src/errors.rs` の `ApiError` に variant を追加する
2. `IntoResponse` のマッピングに status/code/message を追加する
3. 本番で詳細を出さない方針（`is_production()`）を崩さない
4. 既存の呼び出し側を置き換える

## Recipe: Auth 周りを触る時の注意点

- Cookie 名は `backend/src/services/auth.rs` の定数を参照する
- SameSite/Secure はクロスオリジン要件に影響するため、変更前に仕様確認する
- 認証必須の endpoint は `AuthenticatedUser` を handler 引数に入れる（`backend/src/extractors/auth.rs`）
