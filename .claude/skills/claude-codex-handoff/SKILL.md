---
name: claude-codex-handoff
description: |
  Legacy: Claude から Codex に作業を委譲する旧フロー用。
  標準フローでは使用しない。通常は codex-claude-handoff を使う。
  Use only when: ユーザーが明示的に Claude から Codex へ委譲すると指定した時。
---

# Claude Codex Handoff（Legacy）

## Goal
旧フロー互換用。標準フローは `Codex が設計する → Claude が実装する → Codex がレビューする`。

## Rules
- 標準フローでは使用しない
- Codex へ実装を委譲する依頼を作らない
- ユーザーが明示した場合のみ、例外的な逆方向 handoff として扱う

## Output
標準フローでは `codex-claude-handoff` を使うよう案内する。
