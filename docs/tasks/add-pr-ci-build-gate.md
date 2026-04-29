# タスク: PR CI ビルドゲート追加

## 目的

main へのマージ前に lint / typecheck / test / build を自動実行し、壊れたコードが main に入らないようにする。

## 対象

- `.github/workflows/ci.yml` の追加

## 非対象

- `package.json` / `package-lock.json` の変更
- アプリ実装の変更
- GitHub branch protection 設定（Codex が `gh api` で行う）

## 確認コマンド

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
git diff --stat
```

## 受け入れ条件

- [ ] `pull_request` (main 向け) で CI が自動実行される
- [ ] `push to main` でも CI が自動実行される
- [ ] ジョブ名が `Build and Test` で安定している（required status check に設定しやすい）
- [ ] lint / typecheck / test / build がすべてパスする

## 進捗

- [x] `.github/workflows/ci.yml` 追加
- [x] task file 追加
