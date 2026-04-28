---
name: security-review
description: |
  OWASP API Security Top 10 に基づくセキュリティレビュー。
  認証・認可、入力検証、機密情報管理をチェック。
  Use when: セキュリティレビュー、脆弱性チェック、認証関連を依頼された時。
---

# セキュリティレビュー

## チェック項目

### 1. 認証・認可
- [ ] エンドポイントに適切な認証チェックがあるか
- [ ] AuthenticatedUser extractor が正しく使用されているか
- [ ] セッション管理が適切か

### 2. 入力検証
- [ ] ユーザー入力のバリデーションが実装されているか
- [ ] SQLインジェクション対策（パラメータバインディング使用）
- [ ] XSS対策（出力エスケープ）

### 3. 機密情報管理
- [ ] APIキー、シークレットがハードコードされていないか
- [ ] .env ファイルが .gitignore に含まれているか
- [ ] ログに機密情報が出力されていないか

### 4. CORS設定
- [ ] 本番環境で適切なオリジンのみ許可されているか

### 5. エラーハンドリング
- [ ] スタックトレースがユーザーに露出していないか
- [ ] エラーメッセージが過度に詳細でないか

## 確認コマンド

### 機密情報の検索
```bash
grep -r "password\|secret\|api_key\|token" --include="*.rs" --include="*.ts" --include="*.tsx" | grep -v "test\|\.d\.ts"
```

### ハードコードされた認証情報
```bash
grep -rn "Bearer \|Authorization:" --include="*.rs" --include="*.ts"
```

## 参考: OWASP API Security Top 10

1. Broken Object Level Authorization
2. Broken Authentication
3. Broken Object Property Level Authorization
4. Unrestricted Resource Consumption
5. Broken Function Level Authorization
6. Unrestricted Access to Sensitive Business Flows
7. Server Side Request Forgery
8. Security Misconfiguration
9. Improper Inventory Management
10. Unsafe Consumption of APIs
