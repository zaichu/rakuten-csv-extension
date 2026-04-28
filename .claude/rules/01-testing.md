# テスト共通ルール

## テスト原則

- 本番データをテストに使用しない
- 日本語テストデータ（銘柄名など）を適切に使用
- フィクスチャは `__fixtures__/` に配置
- ローカルでフロントエンドとバックエンドを同時に使う検証は、**必ず DB → バックエンド → フロントエンドの順で起動**する

## ローカル起動順ルール

ローカルデバッグ / E2E / UIレビューでは起動順を固定する:

1. ローカルDB起動（例: `cd backend && make db-up`）
2. バックエンド起動（例: `http://127.0.0.1:3001/health` が200になるまで待つ）
3. フロントエンド起動（バックエンドURLをローカル向けに指定）

推奨: プロジェクトルートで `./scripts/start-local.sh` を実行すると、上記 1-3 をまとめて起動できる。

## CI/CD でのテスト

GitHub Actions でのテスト実行:

```yaml
- name: Run frontend tests
  working-directory: frontend
  run: npm test

- name: Run backend tests
  working-directory: backend
  run: cargo test
```
