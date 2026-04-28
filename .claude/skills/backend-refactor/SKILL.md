---
name: backend-refactor
description: |
  shoken-webapp の Rust/Axum バックエンドを安全にリファクタするためのガイド。handlers/services/models/extractors/routes/errors/state の責務整理、重複削除、命名/モジュール分割、依存関係の解消を、API/DB/認証の互換性を保ちながら進める。
  Use when: バックエンドの「挙動は維持したまま構造を変える」作業（整理/共通化/分割/統合/層分離/名前変更/エラーハンドリング見直し）を依頼された時。
---

# Backend Refactor (shoken-webapp)

## Goal

- 外部仕様（APIパス・JSON形・DBスキーマ・認証挙動）を、ユーザーが明示的に依頼しない限り変更しない
- 変更容易性を上げる（責務の分離、重複削除、依存関係の単純化、モジュール境界の明確化）

## Fast Triage (Confirm First)

- リファクタの対象範囲を確認する（どのモジュール/機能、完了条件、優先順位）
- 互換性制約を確認する
- APIパス/JSON形は不変か
- DBスキーマ変更（マイグレーション）は許可されるか
- 認証（Cookie/SameSite/Secure）挙動は不変か
- フロントエンド同時修正はOKか

## Workflow

1. ベースラインを取る
2. 変更計画を短く作る（コンパイル単位で段階化）
3. 機械的な変更から入る（移動/命名/import 修正）
4. 境界ごとに責務を寄せる（handler -> service -> model の順で整理）
5. 仕上げ（fmt/clippy/test と、外部仕様の再確認）

### 1) Baseline

- `cd backend && cargo test` を実行して現状を固定する
- 大きめの移動をする場合は、まず `backend/src/routes.rs` のルートと、エラーレスポンス形式を把握する
- 以降の作業は「ビルドが通る状態」を保ちながら進める

### 2) Plan

- 対象を「どの境界の整理か」で分類する
- HTTP層: `backend/src/handlers/*`
- ドメイン/外部API: `backend/src/services/*`
- モデル/DTO: `backend/src/models/*`
- 横断: `backend/src/errors.rs`, `backend/src/extractors/*`, `backend/src/middleware.rs`, `backend/src/routes.rs`, `backend/src/state.rs`
- 「移動 -> コンパイル -> 置換 -> コンパイル」のように、戻しやすい順序にする

### 3) Execute

- まずは機械的変更（ファイル移動、モジュール分割、命名）を行い、動作変更を混ぜない
- handler は薄くする
- handler は「入力の抽出/認証/バリデーション」と「service 呼び出し」に寄せる
- service は「外部API/DB操作」と「ドメインロジック」に寄せる
- 型は境界に置く
- request: `Validate` + `ValidatedJson<T>`
- response: 既存 JSON 形を維持する DTO を用意する

### 4) Validate

- 途中でも `cargo test` または `cargo check` を小刻みに回す
- 最後に以下を通す（可能な範囲で）
- `cd backend && cargo fmt`
- `cd backend && cargo clippy -- -D warnings`
- `cd backend && cargo test`

## Project-Specific Guardrails

### Routes

- ルート登録は `backend/src/routes.rs` に集約する
- `app_router` は各 `*_routes()` を `merge` して構成する
- パス変更はフロントエンド互換性に直結するため、要求がない限り変更しない

### Error Contract

- エラーレスポンス形式を崩さない（`backend/src/errors.rs`）
- `{ "error": { "code": "...", "message": "...", "details": ... } }`
- 本番で詳細を出しすぎない（`is_production()` の判定を尊重する）

### Auth / Cookies

- Cookie 名は `session_token`（`backend/src/services/auth.rs`）
- クロスオリジン運用では `SameSite=None` + `Secure` が必要になり得る（`services/auth.rs` / `handlers/auth.rs`）
- 認証済みチェックは `AuthenticatedUser` エクストラクターに寄せる（`backend/src/extractors/auth.rs`）

### Module Registries

- 新規作成/分割/移動の時は、対応する registry を必ず更新する
- `backend/src/handlers.rs`
- `backend/src/services.rs`
- `backend/src/models.rs`
- `backend/src/extractors.rs`

## Recipes

### Extract DB Logic From Handler

- 1つの handler から 1つのクエリ単位で service 関数に切り出す
- 引数は `&PgPool` と必要な値（`user_id`, payload 等）を取る
- エラー変換は「どの層で ApiError に寄せるか」を決めて統一する

### Introduce ValidatedJson

- request struct を `models/<domain>.rs` に置く
- `#[derive(Validate)]` を付ける
- handler の引数を `ValidatedJson<T>` に差し替える

### Split A Large Module

- 新ファイルを `handlers/` / `services/` / `models/` / `extractors/` に追加する
- registry（`handlers.rs` など）に `pub mod <name>;` を追加する
- まとまりの良い型/関数を少しずつ移動する

## Related Skills

- API追加/エンドポイント実装が主目的なら `backend-api` を使う
- cargo fmt/clippy/test を回すだけなら `backend-build-test` を使う

## References

- `references/project-structure.md`
- `references/refactor-recipes.md`
