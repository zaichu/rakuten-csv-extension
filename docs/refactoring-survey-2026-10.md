一時的な文書。シリーズの最後の PR で消す

# リファクタリング調査 (2026-10, #202 段階 1)

製品コードは変えていない。10/26〜28 の KISS 総点検 (#182: #184〜#188・#190・#197・#200) で済んだ定数・型・テスト補助・待ち方 (100ms 間隔) は対象外とし、同じ指摘は繰り返さない。

## 前提

- 守ったこと: 機能・外部仕様・権限・manifest・メッセージ契約は不変、既存テストの削除・無効化なし、ダウンロード取り違え防止と CSV 判定・削除・失敗時動作の維持、個人情報・認証情報をログに出さない、計測用 `console.table` は残す。
- 読み方: 重要度は実害・確度で付けた (高・中・低)。おすすめ順は効果÷変更リスクの順。

## 問題の一覧

| # | 問題 | ファイルパスと行 | 根拠 | 重要度 | 影響範囲 | 変更リスク | 期待効果 | おすすめ順 |
|---|------|------------------|------|--------|----------|------------|----------|------------|
| R1 | ダウンロード開始の待ち受けが二重で、判定述語と上限が違う | `src/background/downloadStepExecutor.ts:615-647`、`src/background/downloadedFile.ts:36-91`、`src/background/externalRequestHandler.ts:304-331` | 外部取得では Executor 側の `waitForDownloadStart` (上限 5s、`isRakutenDownloadSource` で内側 URL まで確認) と Handler 側の `createDownloadCapture` (上限 10s、`isCapturableDownloadUrl` は任意の blob:/data: を許可) が同じ `onCreated` を二重に待つ。5s で Executor が失敗確定 (`downloadStepExecutor.ts:319`) しても capture 側は 10s まで待つため、開始が 5〜10s の場合に誤って失敗になる筋がある | 中 | 外部取得の成否判定 | 高 (取り違え防止を弱められない) | 成否判定の一貫、誤失敗の余地を潰す | 7 |
| R2 | `executeStepsOnce` の分岐肥大、成功扱いフォールバックの重複 | `src/background/downloadStepExecutor.ts:271-343` | 「通信切れでも開始観測済みなら成功」が result 分岐 (`328-330`) と catch 分岐 (`332-335`) で重複。要素待ち・送信・クリック待ち・開始確認・例外時の成功扱いが 1 関数に同居 | 低 | 背景の可読性のみ | 中 (失敗時の振る舞いを変えない必要) | 見通し、変更時の取り違え防止 | 2 |
| R3 | `waitForStepElement` の重ね打ち発火が読みにくい | `src/background/downloadStepExecutor.ts:345-382` | `void query.then(...)` で旗だけ立て、`Promise.race` で 100ms ごとに次を送る。期限 30s に対し問い合わせ上限 2s のため最大 20 件程度の `sendMessage` が滞留し得る。上限付きで破綻はしないが、滞留数と終了条件がコードから読み取れない | 中 | 背景の要素待ち | 中 (待ちの挙動変更は取得失敗に直結) | 競合・滞留の見通し | 6 |
| R4 | send+timeout ラッパーが 3 種分散 | `src/background/downloadStepExecutor.ts:384-402,560-580`、`src/background/externalRequestHandler.ts:503-517`、`src/content/rakutenContentScript.ts:365-375` | `queryStepElement` / `checkContentScriptConnection` / `sendToContentScript` / `notifyDownloadWillStart` が「送って上限で区切り、失敗を飲む」の別実装。上限値 (2s/2s/2s/2s) は偶然一致で、方針変更時に 4 箇所を触る | 低 | 背景・内容の通信 | 低 (上限値は変えない) | タイムアウト方針の一元化 | 4 |
| R5 | `waitForTabLoad` と `reloadTabAndWait` が酷似 | `src/background/externalRequestHandler.ts:467-494`、`src/background/downloadStepExecutor.ts:522-551` | ともに `onUpdated` 監視+`createOneShotWait`+解除の同型で、違いは上限超過時の resolve/reject のみ。`createOneShotWait` 自体は #185 で共通化済みで、残りはこの 2 関数の形 | 低 | 背景のタブ待ち | 低 | 重複削減 | 3 |
| R6 | ステップ→セレクター対応が確認系と実行系で二重 | `src/content/rakutenContentScript.ts:124-139,259-291`、`src/types/extension.ts:30-38` | `checkCsvDownloadStep` の対応表と `executeDownloadStep` の switch が同じ「ステップ→セレクター欄」を別々に持ち、遷移系の集合は `PAGE_TRANSITION_STEPS` に第三の定義。手順追加時は 3 箇所の同期が必要 | 低 | 内容の手順追加時 | 中 (実行経路に触れる) | 更新漏れの防止 | 5 |
| R7 | ログイン状態確認にパスキー自動クリックの副作用 | `src/content/rakutenContentScript.ts:146-180` | 問い合わせのはずの `handleCheckLoginState` が 2 回目検出で `button#login-passkey` を押す。認証に触れる隠れた副作用で、セレクター (`173`) 変更時は黙って押さなくなる (ログなし)。動作中は変えない | 中 | ログイン待ちフロー | 高 (認証フロー) | 見通し、意図しない押下の明確化 | 8 |
| R8 | ログ衛生: タブ URL と DOM 要素の出力 | `src/hooks/useCsvDownload.ts:44`、`src/content/rakutenContentScript.ts:434` | `getActiveTab` が URL 全体を `console.log` (クエリに認証由来の値が入る余地)、`clickElementSafely` が要素参照を `console.log` (展開で周辺 HTML が見える)。CSV 本文のログ出力は確認できず (応答は成否・文言のみ、内容は port 経由)。内容側の action のみ記録 (`68`) は配慮済み | 低 | 開発者ツールの表示のみ | 低 (文言・値の削除だけ) | 認証情報・個人情報の露出余地を潰す | 1 |

## やらないと決めたもの

| 対象 | 理由 |
|------|------|
| `console.table` の計測 3 箇所 (`src/background/externalRequestHandler.ts:243,256,283`) | 守ること: 2.0.56 の実機確認まで残す |
| `waitForCompletedDownload` の三重化 (listener+初回確認+1s poll, `src/background/downloadedFile.ts:109-167`) | 完了イベント取りこぼし対策の意図的冗長。削ると完了見逃しに直結 |
| ポーリング間隔の統一 (背景 100ms / 内容 50ms / ログイン 500ms / 完了 poll 1s) | #194・#197 で整理済み。層ごとに役割が違うため統一は過剰な汎用化 |
| `DomUtils.safeClick` のフォールバック連鎖 (`src/utils/domUtils.ts:36-88`) | 楽天サイトの癖への意図的冗長。実害なし |
| タイムアウト値の一元化 (30s/15s/10s/5s/60s/180s) | 層ごとに意味が違う。中央集権は過剰な汎用化 |
| `backgroundService` の振り分け (`src/background/backgroundService.ts:156-198`) | 配線・タブ保持に薄く保たれており混在なし |
| `running` フラグと `pendingCapture` 単一スロット (`src/background/externalRequestHandler.ts:142,145,185-212`) | 同時実行の混ざりを防ぐ必要物。逐次ループのため足りている |
| セレクターの抽象化・Page Object 化 (`src/config/csvDownloadConfigs.ts`) | 過剰な汎用化。`dividend` の menuLink 6 候補 (`50`) も実害未確認のため触らない |
| 到達検証 (navigate 後の URL 確認) の追加 | 実害未確認。設定への新規データ追加になり、サイト知識なしでは汎用化する |
| `isRakutenSecurities` の部分一致 (`src/utils/rakutenUtils.ts:20-22`) | 実質の防御は manifest の matches。実害なし |
| 開始待ち上限の差 (Executor 5s / Handler 10s) の単独統一 | R1 の一部として扱う。単独で揃えると挙動変更になるため R1 と一緒に検討 |

## 検証メモ

- CSV 本文・氏名・口座番号が `console.*` に出る経路は確認できず。内容側は action のみ記録、応答は成否・文言のみ、本文は port 経由で画面へ返すだけ。
- `pendingDownloadClicks` は tabId 上書きでタブ数に bounded、リークではない。
- popup 経路も batch 内 `download-csv` では Executor 側の開始待ち (5s) が働く (`src/background/downloadStepExecutor.ts:236-245`)。外部経路ではそれに加えて capture (10s) が動く二重構造が R1。
