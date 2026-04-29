# improve-download-efficiency

## 提案

現状の改善余地は次の2点。

1. `vite.config.ts` の `build.minify` が `false` で、production build の JS がデバッグ用のまま大きい。
   - `npm run build` の直近出力では popup bundle が約 699KB。
   - Chrome 拡張の読み込み・配布サイズの効率が悪い。
2. `src/background/backgroundService.ts` の `config.stepTimeout` が定義されているが、`executeStep` の `chrome.tabs.sendMessage` 待ちに使われていない。
   - content script が応答しない場合、1ステップが無期限に待機し、ダウンロードジョブ全体が詰まる。
   - 既存の retry 設計を活かすには、1回の step 実行を timeout で失敗させ、`executeStepWithRetry` に戻す必要がある。

## Claude 実装依頼

### 目的

Chrome 拡張の production build を軽くし、CSV ダウンロードの各 step が無期限に詰まらないようにする。

### 期待挙動

- production build は minify される。
- `executeStep` は `this.config.stepTimeout` を使い、content script から応答がない場合に timeout 失敗する。
- timeout は既存の retry loop に乗る。つまり `executeStepWithRetry` が timeout を `lastError` として扱える。
- timeout helper は単体テストで固定する。

### 推奨実装

- `vite.config.ts` の `build.minify: false` を削除するか、`minify: 'esbuild'` に変更する。
- `src/utils/asyncUtils.ts` を追加し、`withTimeout<T>(promise, timeoutMs, timeoutMessage)` のような小さな helper を実装する。
- `src/utils/asyncUtils.test.ts` を追加する。
- `src/utils/index.ts` から必要なら `withTimeout` を export する。
- `src/background/backgroundService.ts` の `executeStep` 内で、`chrome.tabs.sendMessage` の Promise を `withTimeout(..., this.config.stepTimeout, ...)` でラップする。

### TDD 手順

1. 先に `withTimeout` のテストを書く。
2. timeout するケースが失敗することを確認する。
3. helper を実装してテストを通す。
4. `backgroundService.ts` に helper を適用する。

### 対象ファイル

- `vite.config.ts`
- `src/background/backgroundService.ts`
- `src/utils/asyncUtils.ts`
- `src/utils/asyncUtils.test.ts`
- `src/utils/index.ts`
- この task file

### 非対象

- popup UI の見た目変更
- 楽天証券サイトの selector 変更
- CSV download step の順序変更
- 複数 download type の並列実行
- `package.json` / `package-lock.json` の変更
- `.claude/` 配下の変更

### 受け入れ条件

- `npm run lint` が成功する。
- `npx tsc --noEmit` が成功する。
- `npm run test` が成功する。
- `npm run build` が成功する。
- `npm run build` の出力で popup JS bundle が minify 前より小さくなる。
- `git diff --stat` が対象ファイルに収まる。

### 確認コマンド

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
git diff --stat
```
