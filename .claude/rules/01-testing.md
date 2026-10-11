# テスト共通ルール

## テスト原則

- 本番データをテストに使用しない
- 日本語テストデータ（銘柄名など）を適切に使用
- ユニットテストは対象コードと同じディレクトリに `*.test.ts(x)` として配置する
- chrome API は `src/tests/setup.ts` のモックを使う

## 実行コマンド

```bash
npm run lint          # ESLint
npx tsc --noEmit      # 型チェック
npm run test          # Vitest 単体テスト
npm run test:e2e      # ビルド + Playwright E2E
```

手元の検証は lint・型チェック・単体テストまで。E2E は CI に任せる。

## CI

`.github/workflows/ci.yml` が `lint → tsc --noEmit → vitest → build → playwright test` を実行する。
