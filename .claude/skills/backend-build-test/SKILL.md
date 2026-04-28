---
name: backend-build-test
description: |
  Rust/Axum バックエンドのビルドとテスト実行。
  cargo fmt, clippy, test, build を実行。
  Use when: バックエンドのテスト、cargo test、Rustビルドを依頼された時。
---

# バックエンド ビルド・テスト

## 作業ディレクトリ
`backend/`

## コマンド

### フォーマットチェック
```bash
cd backend && cargo fmt --check
```

### フォーマット適用
```bash
cd backend && cargo fmt
```

### Lint (Clippy)
```bash
cd backend && cargo clippy -- -D warnings
```

### テスト実行
```bash
cd backend && cargo test
```

### 開発ビルド
```bash
cd backend && cargo build
```

### リリースビルド
```bash
cd backend && cargo build --release
```

### OpenAPI / api.ts 同期チェック（API変更時は必須）
```bash
bash scripts/check-openapi.sh
```
openapi.json と frontend/src/generated/api.ts を両方再生成して差分を確認する。
差分があれば commit してから push する。

## 推奨実行順序

1. `cargo fmt --check` - フォーマット確認
2. `cargo clippy -- -D warnings` - Lint
3. `cargo test` - テスト
4. `cargo build` - ビルド
5. `bash scripts/check-openapi.sh` - openapi.json と api.ts の同期確認（API変更時）

## よくあるエラー

### 未使用変数警告
```rust
#[allow(dead_code)]  // FromRow で使用される場合
pub field: Type,
```

### 借用チェッカーエラー
- `&self` vs `self` の確認
- ライフタイム注釈の追加

### sqlx コンパイルエラー
- マイグレーション実行済みか確認
- DATABASE_URL が正しいか確認
