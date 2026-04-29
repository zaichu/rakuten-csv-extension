## タスク名
未使用 Bootstrap JS bundle の削除

## 目的
popup JS bundle から未使用の `bootstrap/dist/js/bootstrap.bundle.min.js` を除去し、ファイルサイズを削減する。

## 根拠
- `src` 配下に `data-bs-*` 属性や Bootstrap JS の imperative API（dropdown/modal/collapse など）の利用箇所がない
- Bootstrap JS（Popper.js 同梱）は約 81 kB の追加コストになっていた

## 対象ファイル
- `src/popup/index.tsx` — Bootstrap JS import を削除

## 非対象
- Bootstrap CSS（維持）
- UI の className（変更なし）
- `package.json` / `package-lock.json`

## 確認結果

| コマンド | 結果 |
|---|---|
| `npm run lint` | ✅ エラーなし |
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm run test` | ✅ 15 tests passed |
| `npm run build` | ✅ 成功 |

### popup JS bundle サイズ

| 状態 | サイズ（raw） |
|---|---|
| 削除前 | 288.24 kB |
| 削除後 | 206.82 kB |
| 削減量 | **−81.42 kB（約 28% 削減）** |
