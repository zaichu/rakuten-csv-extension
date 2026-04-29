# GitHub Actions runtime を Node.js 24 対応版に更新

## 目的

GitHub Actions の Node.js 20 runtime deprecation warning を解消する。

## 根拠

- `actions/checkout@v4` と `actions/setup-node@v4` は Node.js 20 ベースの Actions runtime を使用しており、deprecated 警告が出ていた。
- GitHub は 2026-06-02 から Node.js 24 をデフォルト化し、2026-09-16 に Node.js 20 runner support を削除予定。
- 公式 releases/latest を確認した結果:
  - `actions/checkout`: v6.0.2
  - `actions/setup-node`: v6.4.0

## 対象

- `.github/workflows/ci.yml`

## 変更内容

- `actions/checkout@v4` → `actions/checkout@v6`
- `actions/setup-node@v4` → `actions/setup-node@v6`
- `node-version: 20` はアプリのビルド対象 Node であるため維持。

## 非対象

- `package.json` / `package-lock.json` の変更
- アプリ実装の変更
- branch protection 設定の変更
- CI job 名の変更（branch protection の required status check に設定済みのため）

## 確認コマンド

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
git diff --stat
```
