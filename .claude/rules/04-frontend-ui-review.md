# フロントエンドUIレビュー

## 概要

主要ページ（ホーム・銘柄検索・資産管理・取引明細）および CSV CRUD フローのUIレビューを実施し、スクリーンショットと改善提案を task として残す。
**MCPでもE2Eでも、やることと成果物は同じ。**

## Usage
```
/ui-review                    # 完全自動レビュー
/ui-review --screenshots-only # スクリーンショットのみ
/ui-review --review-only      # 既存画像の分析のみ
```

## 完了条件
1. `.playwright-mcp/` に対象スクリーンショットが揃っている
2. `docs/tasks/` に UIレビュー結果の task file（日本語）がある
3. 改善提案に優先度（高/中/低）が付いている

---

## A. 主要ページレビュー

### 必須スクショ（13枚）
保存先: `.playwright-mcp/`

| ファイル名 | 内容 |
|---|---|
| `home-initial.png` | ホームページの初期表示 |
| `search-nintendo-result.png` | 銘柄検索で「任天堂」を検索した結果 |
| `assetbalance-initial.png` | 資産管理ページの初期表示 |
| `assetbalance-search-security.png` | 資産管理ページの銘柄検索結果 |
| `receipts-dividend-initial.png` | 配当金タブの初期表示 |
| `receipts-domestic-stock-initial.png` | 国内株式タブの初期表示 |
| `receipts-mutualfund-initial.png` | 投資信託タブの初期表示 |
| `receipts-dividend-search-year.png` | 配当金 - 西暦検索結果 |
| `receipts-dividend-search-security.png` | 配当金 - 銘柄検索結果 |
| `receipts-domestic-stock-search-year.png` | 国内株式 - 西暦検索結果 |
| `receipts-domestic-stock-search-account.png` | 国内株式 - 口座検索結果 |
| `receipts-mutualfund-search-year.png` | 投資信託 - 西暦検索結果 |
| `receipts-mutualfund-search-fund.png` | 投資信託 - ファンド検索結果 |

### 追加であると安心なスクショ（任意）
| ファイル名 | 内容 |
|---|---|
| `login-initial.png` | ログインページの初期表示（**未ログイン時**） |
| `notfound-404.png` | 404ページ（関連リンク表示） |
| `header-user-menu.png` | ヘッダーのユーザーメニュー展開（**ログイン時**） |
| `header-delete-account-modal.png` | アカウント削除の確認モーダル（**ログイン時**） |
| `search-empty.png` | 銘柄検索の初期状態（EmptyState表示） |
| `search-invalid-code-param.png` | `?code=` が不正な場合の警告表示 |
| `assetbalance-empty.png` | 資産管理が0件のEmptyState（**ログイン時**） |
| `assetbalance-filter-empty.png` | 絞り込み0件のEmptyState（解除リンク表示） |

### スクショ取得コマンド（主要ページ）
標準の実行入口はプロジェクトルートの [`scripts/run-ui-e2e.sh`](/home/zaichu/project/shoken-webapp/scripts/run-ui-e2e.sh) とする。認証情報（`frontend/.auth/storage-state.json`）が必要。初回または期限切れ時は `--save-auth` を付けて再取得する。

```bash
./scripts/run-ui-e2e.sh --skip-csv
./scripts/run-ui-e2e.sh --skip-csv --save-auth
```

---

## B. CSV CRUDレビュー

CSV アップロード→保存→削除の一連フローを対象とする。E2E テスト（`csv-crud.spec.ts`）が自動的にスクショを保存する。

### 必須スクショ（9枚）
保存先: `.playwright-mcp/`

| ファイル名 | 内容 | 検証ポイント |
|---|---|---|
| `csv-domesticstock-after-base-import.png` | 国内株式 - base CSV（3件）取込後 | 3件登録メッセージ、テーブル行数 |
| `csv-domesticstock-after-additional-import.png` | 国内株式 - 追加CSV取込後（重複含む10件登録） | 10件登録メッセージ、occurrence_index による重複許容 |
| `csv-domesticstock-after-delete.png` | 国内株式 - 全件削除後 | EmptyState 表示、全件削除ボタン消滅 |
| `csv-dividend-after-base-import.png` | 配当金 - base CSV（3件）取込後 | 3件登録メッセージ |
| `csv-dividend-after-additional-import.png` | 配当金 - 追加CSV取込後（重複2件スキップ→3件登録） | 3件登録/2件スキップ表示 |
| `csv-assetbalance-after-base-import.png` | 資産管理 - base CSV（2銘柄）取込後 | 全件削除ボタンに「(2件)」と表示 |
| `csv-assetbalance-after-updated-import.png` | 資産管理 - updated CSV（3銘柄）取込後 | 全件削除ボタンに「(3件)」と表示、保有銘柄数の更新 |
| `csv-mutualfund-after-base-import.png` | 投資信託 - base CSV（2件）取込後 | 2件登録メッセージ |
| `csv-mutualfund-after-additional-import.png` | 投資信託 - 追加CSV取込後（重複1件スキップ→2件登録） | 2件登録/1件スキップ表示 |

### スクショ取得コマンド（CSV CRUD）
標準の実行入口はプロジェクトルートの [`scripts/run-ui-e2e.sh`](/home/zaichu/project/shoken-webapp/scripts/run-ui-e2e.sh) とする。`frontend/.auth/storage-state.json` が保存済みであること。

```bash
./scripts/run-ui-e2e.sh --skip-main
./scripts/run-ui-e2e.sh --skip-main --save-auth
```

---

## 実施手順（共通）

### 1) 事前確認
- 本レビューは **8080固定**（`http://127.0.0.1:8080` を使用）
- **起動順は必ず DB → backend → frontend**（ローカルDB起動後、バックエンド `/health` 応答を確認してからフロントエンドを起動）
- ローカルDBは `cd backend && make db-up` で起動する（`backend/.env` はローカルDB向け `DATABASE_URL` を使用）
- E2E / スクショ取得は `./scripts/run-ui-e2e.sh` を標準入口にする
- サーバー起動だけ確認したい場合は `./scripts/run-ui-e2e.sh --start-only` を使う
- まとめて起動するだけなら `./scripts/start-local.sh` も使えるが、レビュー用途では優先しない
- **ログインは必須**。認証情報は `frontend/.auth/storage-state.json` を使用する
  - 初回保存 / 期限切れ時は `./scripts/run-ui-e2e.sh --save-auth --skip-csv` または `./scripts/run-ui-e2e.sh --save-auth --skip-main` を使う
- このアプリのレビューは **PC表示前提**（モバイル評価は対象外）
- スクショは **FHD（1920x1080）** をデフォルトで取得する（4Kが必要な場合は `UI_REVIEW_VIEWPORT=4k` を指定）
- 開発サーバー運用は以下を厳守する
  - 8080が既に起動中なら **再利用**（新規起動しない）
  - 新規起動時は `--strictPort` を必須化（8081/8082への自動フォールバック禁止）
  - 新規起動したプロセスは `trap` で必ず停止する（残留防止）

### 2) 既存スクショを削除
```bash
# 主要ページのみリセット
rm -f .playwright-mcp/*.png

# CSV CRUDも含めてリセット
rm -f .playwright-mcp/csv-*.png
```

### 3) スクショを取得（標準は `run-ui-e2e.sh`）

#### A. 標準フロー
```bash
cd /path/to/shoken-webapp

# 主要ページ + CSV CRUD をまとめて取得
./scripts/run-ui-e2e.sh

# 初回ログイン保存を含める場合
./scripts/run-ui-e2e.sh --save-auth
```

#### B. MCPで取得する場合（主要ページ）
- 先にログインを完了してから開始する
- `http://127.0.0.1:8080/` に遷移して `home-initial.png` を保存
- `http://127.0.0.1:8080/search` で `任天堂` を検索し、`search-nintendo-result.png` を保存
- `http://127.0.0.1:8080/assetbalance` に遷移し、初期表示を `assetbalance-initial.png` として保存
- 資産管理の検索オプション（銘柄）を1つ選択し、`assetbalance-search-security.png` を保存
- `http://127.0.0.1:8080/receipts` に遷移し、各タブ/検索状態を操作して取引明細の9枚を保存
- 設定は `fullPage: true`

#### C. 個別コマンドで取得する場合
`run-ui-e2e.sh` の内部動作を切り分けたい場合のみ使う。通常運用ではこの手順を直接叩かない。

```bash
set -euo pipefail
cd /path/to/shoken-webapp

# ログイン状態を保存（初回のみ/期限切れ時）
# ./scripts/run-ui-e2e.sh --save-auth --skip-csv

# 先にローカルDBを起動して待機
(cd backend && make db-up >/tmp/shoken-db.log 2>&1)
for i in $(seq 1 120); do
  if (cd backend && docker compose -f docker-compose.yml exec -T postgres pg_isready -U user -d shoken_db >/dev/null 2>&1); then
    break
  fi
  sleep 0.5
  if [ "$i" -eq 120 ]; then
    echo "local db did not become ready" >&2
    tail -n 80 /tmp/shoken-db.log >&2 || true
    exit 1
  fi
done

BACK_STARTED=0
if curl -sSf http://127.0.0.1:3001/health >/dev/null 2>&1; then
  echo "reuse existing backend on :3001"
else
  (cd backend && make run >/tmp/shoken-backend.log 2>&1) &
  BACK_PID=$!
  BACK_STARTED=1
fi

for i in $(seq 1 120); do
  if curl -sSf http://127.0.0.1:3001/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [ "$i" -eq 120 ]; then
    echo "backend did not start" >&2
    tail -n 80 /tmp/shoken-backend.log >&2 || true
    exit 1
  fi
done

FRONT_STARTED=0
if curl -sSf http://127.0.0.1:8080/ >/dev/null 2>&1; then
  echo "reuse existing frontend on :8080"
else
  (
    cd frontend
    VITE_SHOKEN_WEBAPI_API_URL=http://127.0.0.1:3001 \
      npm run dev -- --host 127.0.0.1 --port 8080 --strictPort >/tmp/shoken-frontend.log 2>&1
  ) &
  FRONT_PID=$!
  FRONT_STARTED=1
fi

for i in $(seq 1 120); do
  if curl -sSf http://127.0.0.1:8080/ >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
  if [ "$i" -eq 120 ]; then
    echo "frontend did not start" >&2
    tail -n 80 /tmp/shoken-frontend.log >&2 || true
    exit 1
  fi
done

cleanup() {
  if [ "$FRONT_STARTED" -eq 1 ]; then
    kill "$FRONT_PID" >/dev/null 2>&1 || true
  fi
  if [ "$BACK_STARTED" -eq 1 ]; then
    kill "$BACK_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# 主要ページのスクショ取得
(cd frontend && npm run ui:screenshot:auth)

# CSV CRUD フローのスクショ取得
(cd frontend && npm run ui:screenshot:csv-crud)
```

※ `npm run dev` を単独でバックグラウンド起動して放置しないこと（プロセス残留の原因）。
※ 通常運用は `./scripts/run-ui-e2e.sh` を使うこと。

### 4) UIレビュー（画像分析）

#### 4.1) 主要ページの観点
- 視認性（文字サイズ、コントラスト、情報の階層）
- 操作性（クリック領域、状態の分かりやすさ、導線）
- 一貫性（配色、余白、コンポーネント挙動）
- データ表示の妥当性（ラベル誤り、不自然な空白、誤解を生む表現）
- アクセシビリティ（フォーカス、ラベル、可読性）

#### 4.2) CSV CRUDフローの観点
- 取込結果の視認性（登録件数・スキップ件数メッセージが明確か）
- 更新差分の分かりやすさ（全件置換後に保有銘柄数が正しく反映されているか）
- 削除確認UIの安全性（確認モーダルのテキストが誤操作防止に十分か）
- 重複スキップ時のフィードバック（ON CONFLICT スキップ件数が利用者に伝わるか）
- EmptyState の整合性（全件削除後の表示が他画面と一貫しているか）

#### 4.3) 画面横断のデザイン統一性チェック（必須）
- 同じ意味の情報は、画面が違っても同じデザインルールで表示されているかを確認する
- 特に「集計/合計」UIは必ず横断比較する（例: 配当金の合計表示 と 資産一覧の合計表示）
- 比較時は以下を最低限確認する:
  - ラベル表現（用語、粒度、単位）
  - 数値タイポ（文字サイズ、太さ、桁区切り、通貨/パーセント表記）
  - コンテナ表現（背景色、枠線、余白、角丸、並び順）
  - 状態表現（フィルタ適用時、空データ時、ローディング時）
- 不一致を見つけた場合は、改善提案に「どの画面同士の差分か」を明記する

### 5) task 出力
```markdown
## タスク名
UIレビューで見つかった改善対応

## 目的
- 取得済みスクショを元に UI 上の問題点と改善方針を整理する

## スコープ
- UIレビュー所見の記録
- 優先度付き改善タスクの整理

## 非対象
- 実装修正

## 受け入れ条件
- [ ] 主要ページと CSV CRUD のレビュー結果が反映されている
- [ ] 各改善提案に優先度が付いている

## レビュー指摘
- 高: ...
- 中: ...

## メモ
- 取得スクショ: 主要ページ X/13、CSV CRUD X/9
- 未取得スクショがあればここに明記
```

## 運用ルール
- スクショ取得に一部失敗しても、取得できた分でレビューを継続
- 失敗ファイルは「未取得」と明記
- CSV CRUD スクショが未取得の場合は「未評価」と明記して task を継続
- UIレビュー結果は `docs/tasks/` の task file に残す
- task file の命名と運用は `CLAUDE.md` と `docs/tasks/TEMPLATE.md` に従う
- task は必ず日本語で出力
- 作業終了時に `8080/8081/8082` の不要プロセスが残っていないことを確認する
