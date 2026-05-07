# rebuild-from-scratch-plan

## 目的

このプロジェクトを一から作り直す場合の設計方針と、実装へ進めるための task 分割を定義する。

現行実装は小規模な Chrome 拡張として動いているが、popup UI、background の orchestration、content script の DOM 操作、Chrome message contract が密結合になりやすい構造になっている。作り直す場合は、楽天証券サイトの DOM 変化に強く、テストしやすく、不要な外部パッケージを増やさない構成にする。

## 前提

- 対象は Manifest V3 の Chrome 拡張。
- 主機能は楽天証券ページ上での CSV ダウンロード操作の自動化。
- 実装は Claude、設計とレビューは Codex が担当する。
- 1 task = 1 branch = 1 PR とし、main へ直接コミットしない。
- PR 作成時の CI build gate と自動バージョン更新は維持する。

## 技術方針

### 外部パッケージ方針

- 外部パッケージは減らす方針を最優先にする。
- 標準 Web API、Chrome Extension API、React/TypeScript の範囲で十分に書ける処理には dependency を追加しない。
- 新しい dependency を追加する場合は、次を task file に明記してから PR にする。
  - 何を解決するために必要か
  - 標準 API で代替した場合の問題
  - bundle size と保守コスト
  - 削除条件
- production dependency は原則 `react` / `react-dom` だけから始める。
- devDependency も build/test/lint に必要なものへ限定し、UI専用・便利ツール系は入れない。

### 採用する

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Vitest + React Testing Library
- Playwright
- Chrome Extension Manifest V3
- esbuild または Vite の library build による background/content script build

### 条件付きで採用する

- React Router
  - popup が複数画面になる場合だけ採用する。
  - 1画面で完結するなら routing dependency を持たない。
- TanStack Query
  - 原則採用しない。
  - 外部 API の server state、cache invalidation、dedupe が明確に必要になった場合だけ再検討する。
  - Chrome runtime message や DOM automation の状態管理には使わない。
- Recharts
  - 原則採用しない。
  - CSV 取得後の可視化 UI を実装し、SVG/Canvas の自前実装より保守性が明確に高い場合だけ再検討する。

### 採用しない

- Axios
  - 現時点では fetch で十分。interceptor、retry、cancel、base client が必要になるまで入れない。
- Bootstrap
  - Tailwind CSS に統一し、UI styling の二重管理を避ける。
- 未使用の Vite/Chrome 拡張ビルドプラグイン
  - build の透明性を優先し、必要最小限の script で bundle する。

## 設計方針

### ディレクトリ構成案

```text
src/
  app/
    popup/
      PopupApp.tsx
      routes.tsx
  extension/
    background/
      background.ts
      downloadOrchestrator.ts
      tabRegistry.ts
    content/
      content.ts
      domExecutor.ts
      pageAdapters/
        rakutenSecAdapter.ts
  features/
    csvDownload/
      downloadTypes.ts
      downloadPlan.ts
      downloadStateMachine.ts
      selectors.ts
  shared/
    chrome/
      runtimeClient.ts
      tabsClient.ts
    contracts/
      messages.ts
      validators.ts
    utils/
      timeout.ts
      result.ts
  tests/
    fixtures/
```

### 主要責務

- popup
  - ユーザー操作、選択状態、進捗表示だけを担当する。
  - Chrome API 直接呼び出しを避け、`runtimeClient` 経由にする。
- background
  - 対象タブの検出、download plan の順次実行、retry/timeout/cancel を担当する。
  - DOM selector の詳細を知らない。
- content script
  - 楽天証券ページ上の DOM 操作だけを担当する。
  - クリック、要素待機、ページ状態検証を小さい executor に分ける。
- shared contracts
  - popup/background/content 間の message type と runtime validator を一元化する。
  - `unknown` を受けて型ガードで検証し、境界で unsafe cast を閉じ込める。

## 作り直し task 分割

### Task 1: project scaffold を作り直す

- `src/app`, `src/extension`, `src/features`, `src/shared` の骨格を作る。
- Vite + React + TypeScript + Tailwind の最小構成にする。
- Bootstrap と未使用 dependency を入れない。
- production dependency は `react` / `react-dom` のみにする。
- Manifest version は `package.json` から build 時に注入する。

受け入れ条件:
- `npm run lint` が成功する。
- `npx tsc --noEmit` が成功する。
- `npm run build` が成功する。
- `dist/manifest.json` に package version が反映される。
- `npm ls --depth=0 --omit=dev` で production dependency が `react` / `react-dom` だけである。

### Task 2: message contract と Chrome API wrapper を実装する

- popup/background/content 間の message を discriminated union で定義する。
- runtime validator を追加する。
- `chrome.runtime.sendMessage` と `chrome.tabs.sendMessage` を Promise wrapper 化する。
- invalid response は typed error として扱う。

受け入れ条件:
- contract validator の単体テストがある。
- invalid message / invalid response が失敗として扱われる。
- `any` を使わない。

### Task 3: download state machine を実装する

- CSV 種別ごとの download plan を declarative data として定義する。
- `idle -> running -> stepSucceeded/stepFailed -> completed/failed/cancelled` の状態遷移を固定する。
- retry、timeout、cancel を state machine 側に集約する。

受け入れ条件:
- step 成功、timeout、retry exhausted、cancel の単体テストがある。
- DOM selector を state machine に直接持ち込まない。

### Task 4: 楽天証券 page adapter を実装する

- 楽天証券ページごとの selector とページ状態検証を `pageAdapters` に閉じ込める。
- element wait、safe click、CSV button click を executor として分離する。
- selector 変更時に修正範囲が adapter に収まるようにする。

受け入れ条件:
- selector map の型テストまたは単体テストがある。
- content script の public handler は message を受けて executor に委譲するだけにする。

### Task 5: popup UI を Tailwind で再実装する

- popup は業務ツールとして情報密度を保つ。
- 選択、実行、キャンセル、進捗、エラー表示を明確にする。
- UI state と download state を分離する。
- 必要になるまで React Router は入れない。
- icon library は入れず、必要なら小さい inline component またはテキストラベルで済ませる。

受け入れ条件:
- React Testing Library で未選択時、選択時、実行中、エラー時を検証する。
- Playwright smoke test で popup が表示される。
- Bootstrap import が残らない。

### Task 6: E2E と regression fixture を整備する

- Playwright で popup smoke に加え、mock page に対する content script 動作を検証する。
- 楽天証券本番ページに依存しない fixture HTML を用意する。
- DOM 変更検知用の selector coverage test を追加する。

受け入れ条件:
- `npm run test:e2e` がローカルと CI で安定して通る。
- 実サイトにログインしなくても主要 flow を検証できる。

### Task 7: 既存機能との parity check を行う

- 現行で対応している CSV 種別を一覧化する。
- 新実装で同じ種別を実行できることを確認する。
- README、PRIVACY_POLICY、manifest permissions を実装と一致させる。

受け入れ条件:
- 権限は `activeTab`, `tabs`, `https://*.rakuten-sec.co.jp/*` の必要最小限に収まる。
- 未実装機能を README/Privacy に書かない。
- 旧実装との差分と未対応項目が task file に記録される。

## 実装順序

1. Task 1 で scaffold と build を固める。
2. Task 2 で境界 contract を固める。
3. Task 3 で orchestration の中核を実装する。
4. Task 4 で楽天証券 DOM 操作を接続する。
5. Task 5 で popup UI を接続する。
6. Task 6 で E2E を強くする。
7. Task 7 で parity とドキュメントを閉じる。

## Claude への基本依頼テンプレート

```markdown
## 実装依頼

対象 task: <task name>

### 目的
<この task で達成すること>

### 対象ファイル
<変更してよいファイル>

### 非対象
<触らないファイル/やらないこと>

### 受け入れ条件
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test -- --run`
- `npm run build`
- 必要に応じて `npm run test:e2e`

### 制約
- `git add .` を使わない。
- 1 task の範囲外を変更しない。
- 新しい外部パッケージは、必要性と代替案を task file に書いてから追加する。
```

## 判断メモ

- 一から作り直すとしても、最初から巨大な rewrite PR にしない。既存機能を保ちながら、境界 contract、state machine、content adapter、popup の順に差し替える。
- Axios、Bootstrap、React Router、Recharts、TanStack Query は「入れること」が目的になりやすい。現時点の主要機能では Axios と Bootstrap は不要。React Router、Recharts、TanStack Query は将来の画面分割・可視化・API連携 task が出た時点で判断する。
- 一番重要なのは楽天証券 DOM 変更への耐性なので、selector と DOM 操作を adapter に隔離することを優先する。
