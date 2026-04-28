---
name: frontend-build-test
description: |
  React/TypeScript フロントエンドのビルドとテスト実行。
  npm lint, tsc, test, build を実行。
  Use when: フロントエンドのテスト、npm test、TypeScriptビルドを依頼された時。
---

# フロントエンド ビルド・テスト

## 作業ディレクトリ
`frontend/`

## コマンド

### 依存関係インストール
```bash
cd frontend && npm install
```

### Lint
```bash
cd frontend && vp lint
```

### Lint 自動修正
```bash
cd frontend && npm run lint -- --fix
```

### 型チェック
```bash
cd frontend && npx tsc --noEmit
```

### テスト実行
```bash
cd frontend && npm test
```

### 開発サーバー起動
```bash
cd frontend && npm run dev
```

### 本番ビルド
```bash
cd frontend && vp build
```

## 推奨実行順序

1. `vp lint` - Lint
2. `npx tsc --noEmit` - 型チェック
3. `npm test` - テスト
4. `vp build` - ビルド

## よくあるエラー

### 型エラー
- `as` キャストより型ガードを優先
- `unknown` 型には型アサーションが必要

### インポートエラー
- パスエイリアス `@/` の確認
- 拡張子 `.ts` / `.tsx` の確認

### React Hook エラー
- `useEffect` の依存配列確認
- `useMemo` / `useCallback` の適切な使用
