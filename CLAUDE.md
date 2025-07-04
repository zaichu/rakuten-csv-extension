# Claude 設定

## プロジェクト概要
楽天証券からCSVデータをダウンロードするChrome拡張機能

## 開発環境
- Node.js + npm
- React 19 + TypeScript
- Bootstrap 5
- Vite + CRX.js

## 主要コマンド
```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# リント
npm run lint

# テスト
npm run test
```

## プロジェクト構成
```
src/
├── background/       # バックグラウンドサービス
├── content/         # コンテンツスクリプト
├── popup/           # ポップアップUI
├── components/      # React コンポーネント
├── hooks/           # カスタムフック
├── types/           # TypeScript型定義
└── utils/           # ユーティリティ関数
```

## 主要機能
- 楽天証券サイトの自動操作
- CSVファイルの一括ダウンロード
- 進捗表示・エラーハンドリング
- リトライ機能

## 開発時の注意
- 楽天証券サイトでのみ動作
- セキュリティ上、防御的な用途のみ
- DOM操作は慎重に実装