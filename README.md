# 楽天証券 CSV ダウンロード拡張機能

楽天証券の各種ページから投資データをCSV形式で簡単にダウンロードできるChrome拡張機能です。

[![Version](https://img.shields.io/badge/version-2.0.3-blue.svg)](https://github.com/zaichu6/rakuten-csv-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)

## 🌟 主な機能

### データダウンロード対応
- **🏦 ポートフォリオ**: 保有銘柄情報（残高照会）
- **💰 配当金・分配金**: 受取履歴データ
- **📊 国内株式**: 取引履歴・実現損益
- **📈 投資信託**: 取引履歴・実現損益

### 拡張機能の特徴
- **🖱️ ワンクリック操作**: ポップアップから簡単ダウンロード
- **🎯 カテゴリ別選択**: データ種別ごとの選択的ダウンロード
- **🔄 自動処理**: 楽天証券サイトでの操作を自動化
- **⚡ 高速処理**: 効率的なデータ取得とCSV変換
- **🎨 コンパクトUI**: 350×400pxの小さなポップアップ
- **📱 レスポンシブ**: スクロール不要の最適化されたレイアウト

## 📥 インストール

### Chrome Web Store から（推奨）
*公開準備中*

### 手動インストール（開発版）
1. このリポジトリをクローン
   ```bash
   git clone https://github.com/zaichu6/rakuten-csv-extension.git
   cd rakuten-csv-extension
   ```

2. 依存関係をインストール
   ```bash
   npm install
   ```

3. 拡張機能をビルド
   ```bash
   npm run build
   ```

4. Chromeに読み込み
   - Chrome で `chrome://extensions/` を開く
   - 「デベロッパーモード」を有効にする
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist` フォルダを選択

## 🚀 使用方法

### 基本的な使い方

1. **楽天証券にログイン**
   - 楽天証券のWebサイトにログインします

2. **拡張機能を起動**
   - ブラウザのツールバーにある拡張機能アイコンをクリック
   - または楽天証券ページで右クリック → 「CSV をダウンロード」

3. **データを選択**
   - ポップアップで取得したいデータ種別にチェック
   - カテゴリごとの一括選択も可能

4. **ダウンロード実行**
   - 「CSV ダウンロード」ボタンをクリック
   - 自動的にCSVファイルがダウンロードされます

### 対応データ種別

| カテゴリ | データ種別 | ファイル名例 |
|---------|-----------|------------|
| ポートフォリオ | 保有銘柄残高 | `rakuten_assetbalance_YYYYMMDD.csv` |
| 収益情報 | 配当金・分配金 | `rakuten_dividend_YYYYMMDD.csv` |
| 取引履歴 | 国内株式 | `rakuten_domesticstock_YYYYMMDD.csv` |
| 取引履歴 | 投資信託 | `rakuten_mutualfund_YYYYMMDD.csv` |

## 🔧 技術仕様

### アーキテクチャ
```
楽天証券サイト ←→ Content Script ←→ Background Script ←→ Popup UI
                     ↓
                 CSV ダウンロード
```

### 技術スタック
- **Frontend**: React 19 + TypeScript
- **Styling**: Bootstrap 5 (コンパクトなデザイン)
- **Build**: Vite + @crxjs/vite-plugin
- **Testing**: Vitest + Testing Library
- **Code Quality**: ESLint + TypeScript strict mode

### プロジェクト構造
```
src/
├── popup/                    # ポップアップUI (350×400px)
│   ├── RakutenCsvExtensionApp.tsx  # メインアプリケーション
│   └── index.tsx            # エントリーポイント
├── components/              # 再利用可能なUIコンポーネント
│   └── ui/
│       ├── Header.tsx       # コンパクトヘッダー
│       ├── Footer.tsx       # フッター
│       ├── IconLabel.tsx    # アイコン付きラベル
│       └── Message.tsx      # 通知メッセージ
├── hooks/                   # カスタムフック
│   ├── useApplicationMessage.ts # メッセージ管理
│   └── useCsvDownload.ts    # CSV ダウンロード処理
├── content/                 # コンテンツスクリプト
│   └── rakutenContentScript.ts # 楽天証券サイト操作
├── background/              # バックグラウンドサービス
│   └── backgroundService.ts # メッセージルーティング
├── types/                   # TypeScript型定義
│   ├── extension.ts         # 拡張機能関連
│   ├── rakuten.ts          # 楽天証券データ
│   └── ui.ts               # UI コンポーネント
└── utils/                   # ユーティリティ
    ├── rakutenUtils.ts     # 楽天証券固有処理
    └── domUtils.ts         # DOM操作ヘルパー
```

## 🛡️ セキュリティとプライバシー

### データの取り扱い
- **ローカル処理のみ**: すべてのデータ処理はユーザーのブラウザ内で完結
- **外部送信なし**: 個人データや金融データを外部サーバーに送信しません
- **最小権限**: 必要最小限の権限のみを要求
- **透明性**: オープンソースによる完全な透明性

### 使用権限
| 権限 | 理由 |
|-----|------|
| `activeTab` | 現在のタブでCSVダウンロード機能を提供 |
| `downloads` | CSVファイルのダウンロード実行 |
| `contextMenus` | 右クリックメニューでの操作提供 |
| `tabs` | 楽天証券ページの操作と新しいタブでの処理 |
| `host_permissions` | 楽天証券ドメインでのみ動作 |

詳細は [プライバシーポリシー](PRIVACY_POLICY.md) をご覧ください。

## 🔄 自動化される操作フロー

### 配当金・分配金の取得
1. 配当金・分配金ページへ遷移
2. 表示期間を「すべて」に設定
3. 「表示する」ボタンをクリック
4. CSV保存ボタンを押下

### 国内株式取引履歴の取得
1. 実現損益ページへ遷移
2. 「国内株式」タブを選択
3. 表示期間を「すべて」に設定
4. 「この条件で表示する」ボタンをクリック
5. CSV保存ボタンを押下

### 投資信託取引履歴の取得
1. 実現損益ページへ遷移
2. 「投資信託」タブを選択
3. 表示期間を「すべて」に設定
4. 「この条件で表示する」ボタンをクリック
5. CSV保存ボタンを押下

## 💻 開発

### 開発環境のセットアップ
```bash
# プロジェクトのクローン
git clone https://github.com/zaichu6/rakuten-csv-extension.git
cd rakuten-csv-extension

# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド（本番用）
npm run build

# テストの実行
npm run test

# リンティング
npm run lint
```

### 開発ガイドライン
- **TypeScript**: 厳密な型チェックを有効にしています
- **React 19**: 最新のReact機能を活用
- **コンポーネント設計**: 再利用可能で小さなコンポーネント
- **フック活用**: ロジックの分離とテスタビリティの向上
- **レスポンシブデザイン**: 350×400pxでの最適表示

### テスト
```bash
# 全テストの実行
npm run test

# カバレッジ付きテスト
npm run test:coverage

# UIテストの実行
npm run test:ui
```

## 🔍 トラブルシューティング

### よくある問題

**Q: CSV ダウンロードが動作しない**
- A: 楽天証券にログインしているか確認してください
- A: ページが完全に読み込まれるまで待ってから実行してください

**Q: 拡張機能のアイコンが表示されない**
- A: `chrome://extensions/` で拡張機能が有効になっているか確認してください
- A: 楽天証券のページでのみアイコンがアクティブになります

**Q: 一部のデータが取得できない**
- A: 楽天証券のサイト仕様変更の可能性があります
- A: Issues にて報告いただければ対応いたします

### デバッグ方法
1. Chrome DevTools のコンソールでエラーログを確認
2. 拡張機能の背景ページ（chrome://extensions/ → 詳細 → 背景ページ）でログを確認
3. 楽天証券ページでコンテンツスクリプトのエラーを確認

## 🤝 貢献

### 貢献方法
1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエストを作成

### 貢献ガイドライン
- **コード品質**: ESLint ルールに従ってください
- **型安全性**: TypeScript の型定義を必ず追加してください
- **テスト**: 新機能には必ずテストを追加してください
- **ドキュメント**: README の更新も忘れずに行ってください

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルをご覧ください。

## 🙏 謝辞

- 楽天証券のWebサービス
- React および TypeScript コミュニティ
- Chrome Extensions APIの提供

## 📞 サポート

- **バグ報告**: [GitHub Issues](https://github.com/zaichu6/rakuten-csv-extension/issues)
- **機能要望**: [GitHub Discussions](https://github.com/zaichu6/rakuten-csv-extension/discussions)
- **セキュリティ問題**: [security@example.com](mailto:security@example.com)

---

**⚠️ 重要な注意事項**

この拡張機能は非公式のツールです。使用にあたっては以下の点にご注意ください：

- 楽天証券の利用規約に従ってご使用ください
- 投資判断は自己責任で行ってください
- データの正確性については保証いたしません
- 楽天証券のサイト仕様変更により動作しなくなる可能性があります

**🔒 プライバシーとセキュリティ**

この拡張機能はユーザーのプライバシーを最優先に設計されています。すべてのデータ処理はローカルで行われ、外部への送信は一切行いません。詳細については [プライバシーポリシー](PRIVACY_POLICY.md) をご確認ください。

