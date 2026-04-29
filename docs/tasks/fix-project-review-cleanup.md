# fix/project-review-cleanup

## 調査結果

- `manifest.json` は `downloads` と `contextMenus` permission を要求しているが、実装では `chrome.downloads` と `chrome.contextMenus` を使用していない。
- `README.md` と `PRIVACY_POLICY.md` は右クリックメニューと downloads permission を説明しており、実装と権限説明が一致していない。
- `src/hooks/useCsvDownload.ts` は `selectedOptions` を配列として `chrome.runtime.sendMessage` に渡している。
- `src/types/extension.ts` の `CsvDownloadMessage.payload.selectedOptions` は `Set<CsvDownloadType>` になっており、Chrome message の実データ形状とずれている。
- `src/hooks/useCsvDownload.ts` は `sendMessage` の戻り値をすぐ `ChromeApiResponse<DownloadResponse>` にキャストしており、実行時レスポンス形状の検証が弱い。

## Claude 実装依頼

### 目的

Chrome 拡張の権限・ドキュメント・Chrome message contract を実装に合わせ、回帰テストで最低限の動作を固定する。

### 期待挙動

- `manifest.json` の permissions は実装が実際に使うものだけにする。
- README と privacy policy の権限説明は `manifest.json` と一致する。
- `CsvDownloadMessage.payload.selectedOptions` は Chrome message で送信される配列型として定義する。
- `useCsvDownload` は `chrome.runtime.sendMessage` の戻り値を `unknown` として受け、型ガードで次の両方を安全に判定する。
  - `DownloadResponse` の直接レスポンス
  - `ChromeApiResponse<DownloadResponse>` の `{ success: true, data: DownloadResponse }` ラップレスポンス
- 不正な background response は、ユーザー向けに失敗レスポンスとして返る。
- 追加テストで以下を固定する:
  - 未選択時は Chrome API を呼ばずエラーになる。
  - 楽天証券タブで選択済みの場合、`selectedOptions` は配列として background に送信される。
  - background response が不正形状の場合、失敗レスポンスになる。
  - `{ success: true, data: { success: true, message: '...' } }` のラップレスポンスを成功として扱う。

### 対象ファイル

- `manifest.json`
- `README.md`
- `PRIVACY_POLICY.md`
- `src/types/extension.ts`
- `src/hooks/useCsvDownload.ts`
- `src/hooks/useCsvDownload.test.ts` または同等のテストファイル
- 必要なら `src/tests/setup.ts`

### 非対象

- `package-lock.json` / `package.json` の変更
- popup UI の見た目変更
- 楽天証券サイトの selector 変更
- context menu 機能の新規実装
- download API を使った独自 CSV 生成
- バージョン番号変更
- `.claude/` 配下の変更

### 制約

- TypeScript の型安全性を上げる。`any` は使わない。
- 実行時型ガードは小さく読みやすく保つ。
- 既存の `DownloadResponse` / `ChromeApiResponse` 型を活かす。
- テストは jsdom/Vitest で安定して動く形にする。
- 変更はこの task の範囲に限定する。

### 受け入れ条件

- `npm run lint` が成功する。
- `npx tsc --noEmit` が成功する。
- `npm run test` が成功する。
- `npm run build` が成功する。
- `rg -n "downloads|contextMenus|右クリック|CSV をダウンロード" README.md PRIVACY_POLICY.md manifest.json src` で、未実装機能を説明する記述が残らない。

### 確認コマンド

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
rg -n "downloads|contextMenus|右クリック|CSV をダウンロード" README.md PRIVACY_POLICY.md manifest.json src
```

## レビュー指摘

### 2026-04-29 Codex review

1. `package-lock.json` が変更されている。依存関係変更は非対象なので、差分から外すこと。
2. `src/hooks/useCsvDownload.ts` が全体書き換えになっており、既存コメントや改行が大きく変わっている。必要箇所だけの差分に戻すこと。
3. `isWrappedDownloadResponse` が `data` の中身を `DownloadResponse` として検証していない。`data` が不正形状の場合は失敗レスポンスにすること。
4. `ChromeApiResponse<DownloadResponse>` の `success: false` かつ `data` なしの形状は、`error` を返す形で扱うこと。
