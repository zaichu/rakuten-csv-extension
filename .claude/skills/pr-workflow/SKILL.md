---
name: pr-workflow
description: |
  コミット履歴をきれいに保つための Git ブランチ運用と PR 作成ワークフロー。
  `main` と短期作業ブランチの役割、コミット分割、PR、マージ後のブランチ削除までを定義する。
  基準ルールは `.claude/rules/03-git.md` に統一し、本スキルはその実行手順を扱う。
  機能・タスクごとに `main` から 1 本ずつ作業ブランチを作成する前提で運用する。
  Use when: ブランチ運用の相談、コミット、PR作成、マージ後のブランチ削除を依頼された時。
---

# PR ワークフロー

## 基準ルール

- ブランチ運用の唯一の基準は `.claude/rules/03-git.md`
- 本スキルと他ドキュメントで記載が衝突した場合は `.claude/rules/03-git.md` を優先する

## ブランチ戦略

- 長期ブランチ
  - `main`: 本番反映専用。直接コミット禁止。
- 短期ブランチ（作業ごとに作成）
  - `feature/<topic>`
  - `fix/<topic>`
  - `refactor/<topic>`
  - `docs/<topic>`
  - `chore/<topic>`
- 1機能・1タスクにつき作業ブランチは 1 本（同じブランチに別タスクを混ぜない）
- 短期ブランチはマージ後に必ず削除する（ローカル/リモート）

## コミット分割の原則

1. 1コミット = 1目的（機能・修正・リファクタを混在させない）
2. `git add .` / `git add -A` は使わず、`git add <path>` または `git add -p` を使う
3. PR 前に `fixup!` + `rebase -i --autosquash` で不要コミットを整理する
4. `WIP` のような暫定コミットは push 前に整理する

## コミットメッセージ形式

```bash
<種別>: <変更内容の要約>

<詳細説明（任意）>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

- `<変更内容の要約>` と `<詳細説明>` は日本語で記述する

### 種別

- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `docs`: ドキュメント
- `test`: テスト
- `chore`: ビルド・設定変更

## 標準フロー

```bash
# 1) main を最新化
git switch main
git pull --ff-only origin main

# 2) 短期ブランチ作成
git switch -c feature/<topic>

# 3) 変更を目的単位でコミット
git add -p
git commit -m "feat: <変更内容の要約>"

# 4) リモートへ push
git push -u origin feature/<topic>
```

## 履歴整理（PR前）

```bash
# 直近コミットを fixup として積む例
git commit --fixup <target-commit-hash>

# main 基準で自動 squash/fixup
git rebase -i --autosquash origin/main
```

## PR作成手順

作業ブランチは `main` 向けに PR を作成する。

```bash
gh pr create --base main --head <work-branch> --title "タイトル" --body "$(cat <<'EOF_BODY'
## 概要
変更内容の説明

## 変更種別
- [x] 新機能
- [ ] バグ修正

## 主な変更内容
- 項目1
- 項目2

## テスト
- [x] テスト実行確認
- [x] ビルド確認
EOF_BODY
)"
```

## マージ方式

- 作業ブランチ -> `main`: `Squash and merge` を推奨（1タスク1コミット化）

## ブランチ削除（マージ後）

```bash
# 例: feature/login-timeout-fix を削除
git switch main
git pull --ff-only origin main
git branch -d feature/login-timeout-fix
git push origin --delete feature/login-timeout-fix
git fetch origin --prune
```

## 禁止事項

- `main` への直接コミット
- `git add .` / `git add -A`
- `git branch -D` での強制削除（未マージ削除が必要な場合はユーザー明示指示時のみ）
- ユーザーが明示的に依頼していないコミット・PR作成
