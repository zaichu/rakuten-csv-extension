---
name: pr-review
description: |
  Claude が実装した差分または PR を Codex がレビューする。
  Use when: 「PRをレビューして」「レビューしてください」と依頼された時。
  または Claude 実装完了後に Codex が実装レビューする時。
---

# PR Review（Codex 実行）

## Overview
Claude が実装した差分または PR を Codex がレビューする。
全体開発ルール（`.claude/rules/00-general.md`）における標準フローは
`Codex が設計する → Claude が実装する → Codex がレビューする` とし、本スキルで運用する。

ブランチ運用の基準は `.claude/rules/03-git.md` を参照する。

## Workflow

### 1. レビュー対象を確認する
- `docs/tasks/<branch-name>.md` が存在する場合は読む
- `git fetch origin` で比較元を最新化する
- `git branch --show-current` で現在ブランチを確認する
- `gh pr list --state open --head "$(git branch --show-current)" --json number,title,url,body` で open PR を探す
- PR がない場合は、現在ブランチの `origin/main...HEAD` 差分をレビュー対象にする

### 2. レビュー材料を収集する
- `git diff origin/main...HEAD --name-status`
- `git diff origin/main...HEAD --stat`
- `git diff origin/main...HEAD`
- PR がある場合: `gh pr view <PR番号> --json number,title,url,body`

### 3. 検証結果を確定する
変更範囲に応じて実行:

- フロントエンド変更がある場合:
  - `cd frontend && npm run lint`
  - `cd frontend && npx tsc --noEmit`
  - `cd frontend && npm test`
  - `cd frontend && vp build`
- バックエンド変更がある場合:
  - `cd backend && cargo fmt --check`
  - `cd backend && cargo clippy --all-targets -- -D warnings`
  - `cd backend && cargo test`
- API 定義変更がある場合:
  - `bash scripts/check-openapi.sh`

### 4. レビューを実行する
findings first で重大度順に出す:

1. **Findings**（重大度順、`path:line` 付き）
   - `[high]` / `[medium]` / `[low]` で分類
2. **Open questions / assumptions**（あれば）
3. **判定**: LGTM / 要修正

### 5. レビュー結果を記録する
- task file がある場合は `レビュー指摘` に findings と判定を追記する
- PR がある場合は必要に応じて `🤖 Codex review` コメントとして投稿する
- 投稿済みコメントを更新する場合は、先頭が `🤖 Codex review` の最新コメントを更新する

### 6. 修正が必要な場合
`codex-claude-handoff` スキルを使って Claude に修正を依頼する。依頼文には**以下を必ず含める**:

```markdown
## レビュー指摘への対応

以下の各指摘を順番に処理する。
1. 修正を実装する
2. lint/test/build を通す
3. task file の進捗とメモを更新する

### 指摘一覧

| # | 重大度 | 内容 | ファイル:行 | 受け入れ条件 |
|---|--------|------|-----------|--------------|
| 1 | [high] | <内容> | path/to/file.ts:42 | <確認方法> |
```

依頼は `claude -p --continue "<修正依頼>"` で送る。
修正後は本スキルで再レビューする（LGTM まで繰り返す）。

### 7. LGTM 後
- PR 作成、push、マージはユーザー指示または task file のスコープに従う
- マージ前に未解消のレビュー指摘がないことを確認する

## Review Rules
- findings first / 重大度順 / ファイルパスと行番号を必須とする
- 検証コマンドと pass/fail を必ず記録する
- **未解消の指摘が 1 件でも残ればマージしない**

## Output
レビュー結果（findings first）を出力し、必要に応じて task file または PR に記録する。
