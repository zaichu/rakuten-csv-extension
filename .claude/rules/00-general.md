# 全体開発ルール

## 言語・表現

- 日本語で回答する
- コードコメントは日本語
- コミットメッセージは日本語
- 変数名・関数名は英語

## 開発フロー（標準）

### 役割分担
- **Codex**: 調査・設計・タスク定義・実装レビュー・PR レビュー
- **Claude**: Codex が用意した専用 worktree 内での実装・テスト・レビュー指摘対応

### 標準フロー
1. Codex が調査・設計を行い `docs/tasks/<branch-name>.md` を作成する
2. Codex が task file に `Claude 実装依頼` セクションを作り、目的・現状・期待挙動・対象ファイル・制約・受け入れ条件・確認コマンドを明記する
3. Codex が `main` を clean に保ったまま、Claude 実装用の作業ブランチと専用 worktree を作成する
4. Codex が worktree 内で `claude` CLI を直接呼び出し、実装を委譲する
5. Claude がその worktree 内で実装・lint/test/build・task file 更新を行う
6. Codex が差分、テスト結果、受け入れ条件をレビューする
7. **修正が必要な場合**: Codex が task file の `レビュー指摘` に追記し、`claude` CLI で Claude に追加修正を依頼する
8. Claude がレビュー指摘へ対応し、必要なテストを再実行する
9. Codex が再レビュー（ステップ 6 に戻る）
10. LGTM → PR 作成・マージはユーザー指示または task file のスコープに従う

**重要: ステップ 6〜9 は LGTM が出るまで繰り返す。未解消のレビュー指摘が 1 件でも残ればマージ禁止。**

### Codex から Claude を直接呼ぶ手順

- 初回依頼:

```bash
claude -p --permission-mode acceptEdits "$(sed -n '/^## Claude 実装依頼/,$p' docs/tasks/<branch-name>.md)"
```

- レビュー指摘対応:

```bash
claude -p --continue "<Codex のレビュー指摘と修正依頼>"
```

- `claude` CLI が使えない場合は、実行できなかった理由と Claude に渡す依頼文をユーザーへ返す

### タスク管理ルール
- `docs/tasks/<branch-name>.md` が存在する場合は、作業前に必ず読み、進捗とレビュー指摘を更新する
- 中規模以上のタスクでは `docs/tasks/TEMPLATE.md` を元に task file を作成する
- task file はローカルの一時ファイルとして扱い、ユーザー明示指示がない限りコミット・PR に含めない
- task file の更新は原則として対象 worktree 側で行い、main 作業ツリーへ残さない
- task 完了時または作業中止時には、対応する task file を削除する
- backend の API 契約変更時は `bash scripts/check-openapi.sh` を実行して `docs/openapi.json` と `frontend/src/generated/api.ts` を同期する
- Codex は実装委譲前に task file の `Claude 実装依頼` を最新化する
- Claude は実装前に task file のスコープ、非対象、受け入れ条件、タスク固有コマンドを確認する

### Codex が遵守するルール
- 実装前に調査結果、設計方針、非対象、受け入れ条件を task file に書く
- `main` をレビュー/統合用に clean に保ち、Claude 実装前に専用 worktree を用意する
- Claude 実装後は `git diff`、関連テスト、受け入れ条件を確認する
- レビュー指摘は task file の `レビュー指摘` に具体的に書く
- 未解消の指摘がある場合は `claude` CLI で Claude に追加修正を依頼する
- Codex が実装本体を直接変更するのは、ユーザーが明示した場合、または Claude 呼び出しが利用できずユーザーが続行を許可した場合に限る

### Claude が遵守するルール
- task file のスコープと非対象を守って実装する
- Codex が用意した専用 worktree 内でのみ実装する
- 指定された lint/test/build を実行し、結果を返答に含める
- 追加の設計変更が必要な場合は、実装前に Codex へ確認する
- 実装完了後は task file の進捗と必要なメモを更新する

## 出力制約

- 思考過程・内部推論・検討ログは出力しない
- 出力は必要最小限。前置きや冗長な説明は禁止
- 指示されていない改善・設計提案・リファクタは禁止
- 指定がない限り返答は 200 tokens 以内
- 長文が必要な場合は事前に確認する
