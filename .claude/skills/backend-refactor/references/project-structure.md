# Backend Project Structure (shoken-webapp)

Refactor 時に「どこに何を置くか」を迷わないための、backend crate の簡易マップ。

## Entry Points

- `backend/src/main.rs`
- 環境変数読み込み、tracing 初期化、DB 接続+マイグレーション、`AppState` 作成、`routes::app_router` でルーティング構築、起動

- `backend/src/routes.rs`
- ルート登録の集約。`app_router` が各 `*_routes()` を `merge` して構成する

- `backend/src/lib.rs`
- re-export の集約（他 crate やテストから参照されることがある）

## Cross-Cutting

- `backend/src/state.rs`
- `AppState { pool, secrets, client }` と `Secrets`

- `backend/src/errors.rs`
- `ApiError` と JSON エラー契約
- 本番環境で詳細を出しすぎないガード（`is_production()`）を持つ

- `backend/src/middleware.rs`
- `validate_origin` など

- `backend/src/config.rs`
- サーバー設定、CORS、`BACKEND_URL` 等

- `backend/src/db.rs`
- DB 接続とマイグレーション関連

## Feature Modules

- `backend/src/handlers/*`
- HTTP ハンドラ。入力抽出/認証/バリデーションを行い、service を呼ぶ

- `backend/src/services/*`
- ビジネスロジックと外部 API 呼び出し（例: OAuth/J-Quants）

- `backend/src/models/*`
- DB row（`FromRow`）や request/response DTO（`Validate`）を置く

- `backend/src/extractors/*`
- axum extractor（例: `AuthenticatedUser`, `ValidatedJson<T>`）

## Module Registries

新規ファイル追加/分割/移動時に更新する。

- `backend/src/handlers.rs`
- `backend/src/services.rs`
- `backend/src/models.rs`
- `backend/src/extractors.rs`

## Current Routes (Reference)

`backend/src/routes.rs` で定義されている主なパス。

- `/stock`, `/stock/{query}`
- `/jquants/fins/statements`
- `/auth/google`, `/auth/google/callback`, `/auth/me`, `/auth/logout`, `/auth/delete-account`
- `/dividends`, `/dividends/bulk`, `/dividends/all`
- `/domestic-stocks`, `/domestic-stocks/bulk`, `/domestic-stocks/all`
- `/mutualfunds`, `/mutualfunds/bulk`, `/mutualfunds/all`
- `/asset-balances`, `/asset-balances/bulk`, `/asset-balances/all`
- `/health`

## Invariants To Preserve (Unless Requested)

- API のパスと JSON 形
- `ApiError` のレスポンス形式（`errors.rs`）
- Cookie 名 `session_token`（`services/auth.rs`）
