# 楽天証券 CSV ダウンロード拡張機能

楽天証券の各種ページから CSV ファイルを簡単にダウンロードできる Chrome 拡張機能です。

## 🌟 主な機能

- **自動化されたCSVダウンロード**: 楽天証券の各種ページから完全自動でCSVファイルをダウンロード
- **複数データ種類対応**: 保有銘柄、配当金・分配金、国内株式・投資信託の実現損益
- **Popup → Background → Content Scripts アーキテクチャ**: 堅牢で拡張可能な設計
- **MPA（Multi-Page Application）対応**: ページ遷移に対応した状態管理
- **自動リトライ機能**: 一時的な問題を自動で解決
- **柔軟なセレクター対応**: 楽天証券のサイト変更に適応

## 📋 対応する操作フロー

### 保有銘柄
1. マイメニューから保有銘柄のページに遷移
2. CSV保存ボタンを押下

### 配当金・分配金
1. マイメニューから配当金・分配金のページに遷移
2. 表示期間のラジオボタンを「すべて」に選択
3. 表示するボタンを押下
4. CSV保存ボタンを押下

### 国内株式の実現損益
1. マイメニューから実現損益のページに遷移
2. 国内株式タブを選択
3. 表示期間のラジオボタンを「すべて」に選択
4. この条件で表示するボタン押下
5. CSV保存ボタンを押下

### 投資信託の実現損益
1. マイメニューから実現損益のページに遷移
2. 投資信託タブを選択
3. 表示期間のラジオボタンを「すべて」に選択
4. この条件で表示するボタン押下
5. CSV保存ボタンを押下

## 📁 プロジェクト構造

```
src/
├── components/           # UI コンポーネント
│   └── ui/
│       ├── IconLabel.tsx    # アイコンラベルコンポーネント
│       ├── Message.tsx      # メッセージ表示コンポーネント
│       ├── Header.tsx       # ヘッダーコンポーネント
│       ├── Footer.tsx       # フッターコンポーネント
│       └── index.ts         # コンポーネントのエクスポート
├── hooks/               # カスタムフック
│   ├── useApplicationMessage.ts  # メッセージ管理フック
│   ├── useCsvDownload.ts         # CSV ダウンロードフック
│   └── index.ts
├── types/               # TypeScript 型定義
│   ├── extension.ts         # 拡張機能関連の型
│   ├── ui.ts               # UI コンポーネントの型
│   ├── rakuten.ts          # 楽天証券固有の型
│   └── index.ts            # 型のエクスポート
├── utils/               # ユーティリティ関数
│   ├── rakutenUtils.ts     # 楽天証券関連のユーティリティ
│   ├── domUtils.ts         # DOM 操作ユーティリティ
│   └── index.ts
├── content/             # コンテンツスクリプト
│   └── rakutenContentScript.ts
├── background/          # バックグラウンドスクリプト
│   └── backgroundService.ts
└── popup/               # ポップアップ UI
    ├── RakutenCsvExtensionApp.tsx
    └── index.tsx
```

## 🚀 開発環境のセットアップ

### 前提条件

- Node.js (v18 以上)
- npm または pnpm

### インストール

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# テスト実行
npm run test

# ESLint チェック
npm run lint
```

### Chrome 拡張機能として読み込み

1. `npm run build` でビルドを実行
2. Chrome で `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `dist` フォルダを選択

## 🔧 技術スタック

### フロントエンド
- **React 19**: UI ライブラリ
- **TypeScript**: 型安全性
- **Bootstrap 5**: CSS フレームワーク
- **Vite**: ビルドツール

### 開発ツール
- **ESLint**: コード品質
- **Vitest**: テストフレームワーク
- **@crxjs/vite-plugin**: Chrome 拡張機能サポート

### アーキテクチャパターン
- **カスタムフック**: ロジックの再利用
- **コンポーネント分離**: UI の再利用性
- **型駆動開発**: TypeScript による安全性
- **ユーティリティファースト**: 関数の再利用

## 📖 使用方法

### 基本的な使い方

1. 楽天証券にログインし、対応ページに移動
2. 拡張機能アイコンをクリック
3. 「CSV ダウンロード」ボタンをクリック

### 対応ページ

- **配当金・分配金ページ**: 配当金履歴の CSV ダウンロード
- **取引履歴ページ**: 取引履歴の CSV ダウンロード  
- **ポートフォリオページ**: 保有銘柄の CSV ダウンロード

### 右クリックメニュー

楽天証券のページで右クリックすると、「CSV をダウンロード」メニューが表示されます。

## 🏗️ アーキテクチャ

### コンポーネント設計

```typescript
// 例: IconLabel コンポーネント
interface IconLabelProps {
  icon: string;
  label: string;
  containerClassName?: string;
  iconClassName?: string;
}

export const IconLabel = ({ icon, label, ...props }: IconLabelProps) => (
  <div className={props.containerClassName}>
    <span className={props.iconClassName}>{icon}</span>
    {label}
  </div>
);
```

### カスタムフック

```typescript
// 例: CSV ダウンロードフック
export const useCsvDownload = () => {
  const [isDownloading, setIsDownloading] = useState(false);
  
  const downloadCsv = useCallback(async (type: CsvDownloadType) => {
    // ダウンロード処理
  }, []);

  return { isDownloading, downloadCsv };
};
```

### 型安全性

すべての関数とコンポーネントは TypeScript で型定義されており、コンパイル時にエラーを検出できます。

## 🧪 テスト

```bash
# 全テストの実行
npm test

# カバレッジ付きテスト
npm run test:coverage

# UI テスト
npm run test:ui
```

### テスト構造

```
src/tests/
├── App.test.tsx              # アプリケーションテスト
├── custom-css.test.ts        # CSS テスト
├── rakuten-content.test.ts   # コンテンツスクリプトテスト
└── setup.ts                  # テストセットアップ
```

## 🔍 トラブルシューティング

### よくある問題

1. **CSV ダウンロードボタンが見つからない**
   - ページが完全に読み込まれているか確認
   - 楽天証券の仕様変更の可能性

2. **拡張機能が動作しない**
   - Chrome の拡張機能が有効になっているか確認
   - ページを再読み込みしてみる

3. **ビルドエラー**
   - `node_modules` を削除して `npm install` を再実行
   - Node.js のバージョンを確認

### デバッグ方法

1. Chrome DevTools でコンソールログを確認
2. 拡張機能の背景ページでログを確認
3. コンテンツスクリプトのエラーを確認

## 🤝 貢献

### 開発ガイドライン

1. **コード規約**: ESLint ルールに従う
2. **命名規則**: 
   - ファイル名: camelCase
   - コンポーネント: PascalCase
   - フック: use から始まる camelCase
3. **型定義**: すべての関数に型を定義
4. **テスト**: 新機能には必ずテストを追加

### プルリクエスト

1. フィーチャーブランチを作成
2. 変更を実装
3. テストを追加
4. ESLint チェックを通す
5. プルリクエストを作成

## 📝 ライセンス

MIT License

## 📞 サポート

問題や質問がある場合は、GitHub Issues でお気軽にお問い合わせください。

## 🚀 今後の予定

- [ ] 自動ダウンロード機能
- [ ] ファイル名のカスタマイズ
- [ ] ダウンロード履歴の表示
- [ ] 複数ページの一括ダウンロード
- [ ] 設定ページの追加
- [ ] 楽天証券の他のページ対応

---

**注意**: この拡張機能は非公式です。楽天証券の利用規約に従ってご使用ください。
