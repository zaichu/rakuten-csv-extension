---
name: codex-claude-handoff
description: "Codex から Claude に修正実装を依頼するときのベースプロンプトを生成する。Use when: バグ修正、レビュー指摘対応、リファクタリング、挙動不一致の調査などを Claude に委譲するとき。依頼文の不足で往復が増える状況を避けたいとき。"
---

# Codex Claude Handoff

## Goal
Claude が最短で実装に着手できる依頼文を作成し、Codex から `claude` CLI で直接渡す。

## Workflow
1. 依頼の目的を1文で確定する。
2. 現状の挙動と期待挙動を対で書く。
3. 根拠となるファイルとログを列挙する。
4. 制約と非対象を明記する。
5. 受け入れ条件と確認コマンドを明記する。
6. `references/base_prompt_template.md` のテンプレートに埋め込む。
7. 初回依頼は `claude -p --permission-mode acceptEdits "<依頼文>"` で実行する。
8. レビュー指摘対応は `claude -p --continue "<修正依頼>"` で同じ文脈に渡す。

## Rules
- 曖昧語を避ける。: 「いい感じ」「必要なら」などを使わない。
- 期待結果を検証可能に書く。: 画面表示、レスポンス、テスト結果を具体化する。
- ファイルパスを必ず明示する。: Claude が探索コストをかけないようにする。
- 非対象を明記する。: ついでの変更を防ぐ。
- 実行コマンドを先に渡す。: lint/test/build の実施範囲を固定する。

## Output
Claude に渡す最終プロンプトと実行した `claude` コマンドの結果を返す。
