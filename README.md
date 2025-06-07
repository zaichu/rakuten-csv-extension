# 楽天証券CSVダウンロード拡張機能

楽天証券の取引データを簡単にCSV形式でダウンロードできるChrome拡張機能です。

## 機能

- 楽天証券の配当・分配金ページでCSVダウンロードボタンをワンクリック
- モダンなBootstrapベースのUIデザイン
- レスポンシブ対応とダークモード対応
- アクセシビリティに配慮した設計

## UIデザイン

この拡張機能は**Bootstrap 5.3.6**を使用して、美しく使いやすいインターフェースを提供しています。

### 主な特徴

- **楽天ブランドカラー**を基調とした統一されたデザイン
- **カード型レイアウト**で情報を整理
- **アニメーション効果**でスムーズなユーザー体験
- **レスポンシブデザイン**でモバイルにも対応
- **ダークモード対応**で目に優しい表示
- **アクセシビリティ**機能でスクリーンリーダーにも対応

### カスタムCSSクラス

- `.popup-container` - メインコンテナ
- `.btn-rakuten` - 楽天カラーのプライマリボタン
- `.btn-outline-rakuten` - 楽天カラーのアウトラインボタン
- `.alert-success-custom` - カスタム成功アラート
- `.alert-danger-custom` - カスタムエラーアラート
- `.action-card` - アクションカード
- `.loading-spinner` - ローディングアニメーション

## 技術スタック

- **React 19.1.0** - UIライブラリ
- **TypeScript 5.8.3** - 型安全な開発
- **Bootstrap 5.3.6** - UIフレームワーク
- **Vite 6.3.5** - 高速なビルドツール
- **Vitest 2.1.8** - テストフレームワーク
- **Testing Library** - コンポーネントテスト

## 開発環境のセットアップ

### 前提条件

- Node.js 18以上
- npm または yarn

### インストール

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage

# テストUIの起動
npm run test:ui

# Lint実行
npm run lint
```

## ディレクトリ構造

```
src/
├── popup/           # ポップアップUI
│   ├── App.tsx      # メインコンポーネント
│   ├── index.tsx    # エントリーポイント
│   ├── index.html   # ポップアップHTML
│   └── custom.css   # カスタムCSS
├── content/         # コンテンツスクリプト
│   ├── index.tsx    # エントリーポイント
│   └── rakuten-content.ts # 楽天証券サイト操作
└── tests/          # テストファイル
    ├── setup.ts     # テスト設定
    ├── App.test.tsx # Appコンポーネントテスト
    ├── rakuten-content.test.ts # コンテンツスクリプトテスト
    └── custom-css.test.ts # CSSテスト
```

## 使用方法

1. 楽天証券にログインして配当・分配金ページにアクセス
2. 拡張機能のポップアップを開く
3. 「CSVダウンロード」ボタンをクリック
4. 自動的にCSVファイルがダウンロードされます

## テスト

このプロジェクトには包括的なテストスイートが含まれています：

- **ユニットテスト**: コンポーネントとロジックのテスト
- **統合テスト**: ユーザーインタラクションのテスト
- **CSSテスト**: スタイルクラスの存在確認
- **アクセシビリティテスト**: ARIA属性とキーボード操作

### テスト実行コマンド

```bash
# 全テスト実行
npm test

# ウォッチモードでテスト実行
npm test -- --watch

# カバレッジレポート生成
npm run test:coverage

# テストUIの起動（ブラウザでテスト結果を表示）
npm run test:ui
```

## 開発ガイドライン

### コーディング規約

- **TypeScript**: `any`型は使用禁止
- **ESLint**: 設定に従った厳格なコード品質チェック
- **テスト**: 新機能には必ずテストを追加
- **CSS**: Bootstrapクラスを基本とし、必要に応じてカスタムCSSで拡張

### Git コミット規約

```bash
# 新機能追加
git commit -m "feat: add CSV download functionality"

# バグ修正
git commit -m "fix: resolve popup display issue"

# スタイル変更
git commit -m "style: update button colors"

# テスト追加
git commit -m "test: add unit tests for App component"
```

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 貢献

プルリクエストやイシューの投稿を歓迎します。開発に参加する際は、以下の手順をお守りください：

1. フォークを作成
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. コミット (`git commit -m 'feat: add amazing feature'`)
4. プッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 更新履歴

### v1.0.0 (2025-06-08)

- Bootstrap 5.3.6を使用したUIの全面リニューアル
- レスポンシブデザインとダークモード対応
- 包括的なテストスイートの追加
- アクセシビリティの向上
- TypeScriptとESLintによる型安全性の向上
