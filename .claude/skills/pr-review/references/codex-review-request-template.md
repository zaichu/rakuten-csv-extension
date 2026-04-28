# Codex Review Request Template

以下をそのまま埋めて Codex に渡す。

```markdown
以下の変更をコードレビューしてください。
**findings first** で、**重大度順** に指摘してください。

## 対象
- PR: <PR URL または PR 番号>
- 比較範囲: <例: origin/main...HEAD>
- 対象コミット: <最新コミットSHA>

## 変更ファイル
- <path1>
- <path2>
- <path3>

## 変更概要
- <要点1>
- <要点2>

## 実行結果
- `<command 1>`: <pass/fail>
- `<command 2>`: <pass/fail>
- `<command 3>`: <pass/fail>

## レビュー観点
- バグ/仕様不整合
- 回帰リスク
- エラーハンドリング不足
- テスト不足
- 型安全性・保守性

## 期待する出力形式
1. Findings（重大度順、`path:line` 付き）
2. Open questions / assumptions
3. 修正方針サマリー（短く）
```
