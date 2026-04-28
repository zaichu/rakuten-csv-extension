---
name: git-pushing
description: |
  変更を選択的にステージングし、コミットしてリモートへ push する。
  コミット履歴を汚さないため、`git add .` を避けて staged 差分を明示確認してから push する。
  ブランチ運用の基準は `.claude/rules/03-git.md` に統一し、本スキルはコミット/push 操作を担当する。
  Use when: コミットと push を依頼された時、リモートへ push したいと明示された時、
  または「push して」「commit and push」「push to github」などの表現がある時。
---

# Git Push Workflow

履歴を汚さないことを最優先に、staged された変更のみをコミットして push する。

## 基準ルール

- ブランチ運用の唯一の基準は `.claude/rules/03-git.md`
- 本スキルは「作業ブランチ上でのコミット/push」に限定して実行する

## 必須ルール

- `git add .` / `git add -A` を使わない
- 先に `git add <path>` または `git add -p` で対象変更を絞る
- コミットメッセージは必ず引数で明示する
- コミットメッセージの要約・本文は日本語で書く
- `main` には直接コミットしない
- 機能・タスクごとに `main` から作業ブランチを作って実行する

## Workflow

```bash
# 0) main から作業ブランチを作成（1タスク1ブランチ）
git switch main
git pull --ff-only origin main
git switch -c feature/<topic>

# 1) staged 内容を確認
git status -sb
git diff --cached

# 2) まだ staged していない場合は対象だけ追加
git add -p

# 3) コミットして push
bash .claude/skills/git-pushing/scripts/smart_commit.sh "feat: <変更内容の要約>"
```

## マージ後のブランチ削除

マージ済みの作業ブランチは削除する。

```bash
git switch main
git pull --ff-only origin main
git branch -d <work-branch>
git push origin --delete <work-branch>
git fetch origin --prune
```
