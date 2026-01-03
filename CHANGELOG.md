# Changelog

このプロジェクトの主な変更点を記録します。

バージョン番号は [セマンティックバージョニング](https://semver.org/) に従います。

## [2.0.3] - 2026-01-03

### 改善
- shokenwebUtils.tsのリファクタリング
  - エラーハンドリングの改善
  - 非同期処理への対応
  - Chrome API存在チェックの追加
  - 不適切なフォールバック処理の削除

### 追加
- shokenwebUtils.tsの包括的なユニットテスト実装
  - 7つのテストケースでカバレッジ100%を達成
  - Chrome APIのモック処理
  - エラーケースのテスト

### 変更
- `openShokenWebPage()`を同期関数から非同期関数に変更
- `getBaseUrl()`メソッドを追加

## [2.0.2] - 2024-XX-XX

### 変更
- 証券WebをVercelに移行

### 修正
- 実現損益のCSV取得ですべて表示ボタンが押せなくなっていた問題を修正

## [2.0.1] - 2024-XX-XX

### 追加
- 証券Webのリンク追加

### 改善
- ページ遷移の間隔調整
- デザイン修正

## [2.0.0] - 2024-XX-XX

### 追加
- React 19へのアップグレード
- TypeScript厳密モードの有効化
- Vitest + Testing Libraryによるテスト環境の構築
- コンパクトなUI (350×400px)

### 変更
- Bootstrap 5への移行
- Vite + @crxjs/vite-pluginによるビルドシステムの刷新
- プロジェクト構造の再編成

### 改善
- コンポーネントベースのアーキテクチャ
- カスタムフックによるロジックの分離
- 型安全性の向上

## [1.0.0] - 2024-XX-XX

### 追加
- 初回リリース
- 楽天証券からのCSVダウンロード機能
  - 保有銘柄残高
  - 配当金・分配金
  - 国内株式取引履歴
  - 投資信託取引履歴
- Chrome拡張機能として実装
- 自動化された操作フロー

---

## リンク形式の説明

- [2.0.3]: 現在のバージョン
- [2.0.2]: https://github.com/zaichu6/rakuten-csv-extension/releases/tag/v2.0.2
- [2.0.1]: https://github.com/zaichu6/rakuten-csv-extension/releases/tag/v2.0.1
- [2.0.0]: https://github.com/zaichu6/rakuten-csv-extension/releases/tag/v2.0.0
- [1.0.0]: https://github.com/zaichu6/rakuten-csv-extension/releases/tag/v1.0.0
