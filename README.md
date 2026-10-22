# 楽天証券 CSV ダウンロード拡張機能

楽天証券の各種ページから投資データをCSV形式で簡単にダウンロードできるChrome拡張機能です。

[![Version](https://img.shields.io/github/package-json/v/zaichu/rakuten-csv-extension?filename=package.json)](https://github.com/zaichu/rakuten-csv-extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)

## 🌟 主な機能

### データダウンロード対応
- **🏦 ポートフォリオ**: 保有銘柄・投資信託の保有残高情報（残高照会）
- **💰 配当金・分配金**: 受取履歴データ
- **📊 国内株式**: 取引履歴・実現損益
- **📈 投資信託**: 取引履歴・実現損益

### 拡張機能の特徴
- **🖱️ ワンクリック操作**: ポップアップから簡単ダウンロード
- **🎯 カテゴリ別選択**: データ種別ごとの選択的ダウンロード
- **🔄 自動処理**: 楽天証券サイトでのCSV保存操作を自動化
- **⚡ まとめて実行**: 選択した複数データを連続でダウンロード
- **🎨 コンパクトUI**: 幅350pxの小さなポップアップ
- **📱 レスポンシブ**: スクロール不要の最適化されたレイアウト

## 📥 インストール

### Chrome Web Store から（推奨）
*公開準備中*

### 手動インストール（開発版）
1. このリポジトリをクローン
   ```bash
   git clone https://github.com/zaichu/rakuten-csv-extension.git
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
| ポートフォリオ | 投資信託の保有残高 | `rakuten_fundbalance_YYYYMMDD.csv` |
| 収益情報 | 配当金・分配金 | `rakuten_dividend_YYYYMMDD.csv` |
| 実現損益 | 国内株式 | `rakuten_domesticstock_YYYYMMDD.csv` |
| 実現損益 | 投資信託 | `rakuten_mutualfund_YYYYMMDD.csv` |

### 画面(shoken-webapp)からの取得

拡張機能は、指定したWebページからの依頼を受け付けてCSVの本文(ファイルではなく中身)を返します。
接続を許すオリジンは `https://shoken-webapp.pages.dev` と `http://localhost`(ローカル確認用)だけで、
background 側でも送信元のオリジンを検査します。

CSVはURLを再取得しても取得できないため、ブラウザが保存したCSVファイルを拡張機能が直接読み取り、
読み終えたらそのファイルを削除します(ダウンロードフォルダにCSVを残しません)。
この読み取りには「ファイルの URL へのアクセス」が必要です。設定が OFF のまま依頼すると、
失敗として `code: 'file-access-disabled'` を返します。

**設定手順**

1. `chrome://extensions/` を開く
2. この拡張機能の「詳細」をクリックする
3. 「ファイルの URL へのアクセスを許可する」を ON にする

画面のコンソールから依頼する例です(拡張機能IDは `chrome://extensions/` で確認できます)。

```js
const port = chrome.runtime.connect('<拡張機能ID>');
port.onMessage.addListener((message) => console.log(message));
port.postMessage({ type: 'fetchLatestCsv', kinds: ['assetbalance', 'dividend'] });
```

| 方向 | メッセージ |
|------|------------|
| 画面 → 拡張機能 | `{ type: 'fetchLatestCsv', kinds: ['assetbalance', ...] }` |
| 拡張機能 → 画面 | `{ type: 'progress', state: 'login-wait' \| 'fetching' \| 'completed' \| 'failed', kind, reason }` |
| 拡張機能 → 画面 | `{ type: 'result', csvs: [{ kind, content, fetchedAt, fileRemoved }], failures: [{ kind, reason, code }] }` |
| 拡張機能 → 画面 | `{ type: 'error', error }`（受け付けない依頼の場合） |

- 未ログインならログイン画面を開き、ログインの完了を待ちます（`state: 'login-wait'`）
- 返るのはCSVの本文だけです。氏名・口座番号などの個人情報を含んだログやエラーは出しません
- 文字コードはUTF-8として解釈し、解釈できない場合のみShift_JISとして解釈します
- CSVの本文は「CSVで保存」のクリック直前に待ち受けを開始して取得するため、同時に別のダウンロードが始まっても取り違えません(ポップアップからのダウンロードなど、対象タブ以外の操作では待ち受けを開始しません)
- 読み込んだファイルは削除します。削除に失敗した場合も取得は成功として扱い、`fileRemoved: false` を返します

## 🔧 技術仕様

### アーキテクチャ
```
楽天証券サイト ←→ Content Script ←→ Background Script ←→ Popup UI
                     ↓
                 CSV ダウンロード
```

### 技術スタック
- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS（ローカル semantic クラス）
- **Build**: Vite + esbuild
- **Testing**: Vitest + React Testing Library + Playwright
- **Code Quality**: ESLint + TypeScript strict mode

### プロジェクト構造
```
src/
├── popup/                    # ポップアップUI (幅350px)
│   ├── RakutenCsvExtensionApp.tsx  # メインアプリケーション
│   ├── shokenWeb.ts         # 証券Webを開く
│   ├── index.tsx            # エントリーポイント
│   └── index.html           # ポップアップHTML
├── components/              # 再利用可能なUIコンポーネント
│   ├── CategorySection.tsx  # カテゴリ別オプション
│   ├── ProgressDisplay.tsx  # 進捗表示
│   ├── SelectionSummary.tsx # 選択状況の表示
│   ├── downloadOptions.ts   # ダウンロードオプション定義
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
│   ├── backgroundService.ts # イベント配線・メッセージルーティング・タブ状態
│   ├── downloadStepExecutor.ts # ダウンロードステップ実行
│   ├── downloadedFile.ts    # ダウンロードされたファイルの捕捉・検査・読み取り
│   └── externalRequestHandler.ts # 外部ページ(shoken-webapp)からの取得依頼
├── config/                  # 設定
│   └── csvDownloadConfigs.ts # CSVダウンロード設定
├── types/                   # TypeScript型定義
│   ├── extension.ts         # 拡張機能関連
│   ├── rakuten.ts          # 楽天証券データ
│   └── ui.ts               # UI コンポーネント
├── utils/                   # ユーティリティ
│   ├── rakutenUtils.ts     # 楽天証券固有処理
│   ├── domUtils.ts         # DOM操作ヘルパー
│   ├── asyncUtils.ts       # 非同期ヘルパー
│   └── csvDecoder.ts       # CSVの文字コード判定
├── styles/
│   └── tailwind.css        # Tailwind CSS
└── tests/
    └── setup.ts            # Vitestセットアップ(chrome APIモック)
e2e/
├── smoke.spec.ts           # Playwrightスモークテスト
├── fund-possess.spec.ts    # 投資信託の保有残高オプションのE2Eテスト
├── fetch-latest-csv.spec.ts # 画面からのCSV本文取得のE2Eテスト
└── fixtures/rakuten-mock/  # 楽天証券の疑似ページ(E2E用)
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
| `tabs` | 楽天証券ページの操作と新しいタブでの処理 |
| `downloads` | CSVダウンロードの開始を検知し、完了したファイルを読み取る・削除する |
| `host_permissions` | 楽天証券ドメインでのみ動作。`file:///*` は画面(shoken-webapp)からの取得時に、拡張機能がダウンロードしたCSVファイルを読むためだけに使います(「ファイルの URL へのアクセスを許可する」がONの場合に限り有効) |
| `externally_connectable` | 指定したWebページ(shoken-webapp・localhost)からの取得依頼にのみ応答 |

詳細は [プライバシーポリシー](PRIVACY_POLICY.md) をご覧ください。

## 🔄 自動化される操作フロー

CSVファイルは楽天証券サイト自身の「CSVで保存」機能が生成し、拡張機能はその操作を自動化します。

### 保有銘柄の取得
1. 保有銘柄ページへ遷移
2. CSV保存ボタンを押下

### 投資信託の保有残高の取得
1. 投資信託の保有一覧ページへ遷移
2. CSV保存ボタンを押下

### 配当金・分配金の取得
1. 配当金・分配金ページへ遷移
2. 表示期間を「すべて」に設定
3. 「表示する」ボタンをクリック
4. CSV保存ボタンを押下

### 国内株式の実現損益の取得
1. 実現損益ページへ遷移（国内株式はデフォルトタブ）
2. 表示期間を「すべて」に設定
3. 「この条件で表示する」ボタンをクリック
4. CSV保存ボタンを押下

### 投資信託の実現損益の取得
1. 実現損益ページへ遷移
2. 「投資信託」タブを選択
3. 表示期間を「すべて」に設定
4. 「この条件で表示する」ボタンをクリック
5. CSV保存ボタンを押下

## 💻 開発

### 開発環境のセットアップ
```bash
# プロジェクトのクローン
git clone https://github.com/zaichu/rakuten-csv-extension.git
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
- **レスポンシブデザイン**: 幅350pxのポップアップに最適化

### バージョン管理
バージョンのソースは `package.json` です。`manifest.json` の `version` フィールドは `0.0.0` のプレースホルダで、`npm run build` 実行時に `scripts/build-extension.mjs` が `package.json` の version を読み取り `dist/manifest.json` へ反映します。

main への PR マージ後、GitHub Actions が `npm version patch --no-git-tag-version` で `package.json` / `package-lock.json` を更新する patch version bump PR を自動作成します。手動でバージョンを書き換える必要はありません。

### アイコンとストア掲載素材

アイコンは1ファイルを正本として、ストア掲載と拡張機能本体で共通利用します。

- [`assets/chrome-web-store/store-icon-128.png`](assets/chrome-web-store/store-icon-128.png): `manifest.json` とChrome Web Storeで共通利用する唯一のアイコン正本
- [`assets/chrome-web-store/`](assets/chrome-web-store/): Chrome Web Storeのスクリーンショット、プロモーション画像、共通アイコン
- [`release/`](release/): `main` の最新コミットから生成した拡張機能パッケージと掲載素材ZIP

ビルド時は共通アイコンだけを `dist/assets/chrome-web-store/` にコピーします。

### テスト
```bash
# 全テストの実行
npm run test

# カバレッジ付きテスト
npm run test:coverage
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

- **バグ報告**: [GitHub Issues](https://github.com/zaichu/rakuten-csv-extension/issues)
- **機能要望**: [GitHub Discussions](https://github.com/zaichu/rakuten-csv-extension/discussions)
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
