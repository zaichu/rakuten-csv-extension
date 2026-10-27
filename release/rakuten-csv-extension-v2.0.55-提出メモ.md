# v2.0.55 提出メモ

## ストアの「この版での変更」に貼る文

取得の途中で要素が見つからないとき、手順の送り直しをやめ、1回の試行の中で最大15秒まで待つようにしました(待ち時間の合計はほぼ同じです)。ボタンの二度押しを減らします。
内部の整理を行いました(利用者向けの変化はありません)。

## 権限

変更なし。`manifest.json` は v2.0.54 から差分なし(`git diff` で確認)。

- permissions: `tabs`、`downloads`
- host_permissions: `https://*.rakuten-sec.co.jp/*`、`file:///*`
- externally_connectable: `https://shoken-webapp.pages.dev/*`、`http://localhost/*`

## 成果物

- `release/rakuten-csv-extension-v2.0.55.zip`(拡張機能本体。ルートに `manifest.json`、version 2.0.55 を確認済み)
- `release/chrome-web-store-assets-v2.0.55.zip`(掲載素材: アイコン・掲載スクリーンショット 3 枚・プロモーション画像 2 枚)

掲載スクリーンショットは v2.0.54 から更新なし(画面の変更なしのため)。
