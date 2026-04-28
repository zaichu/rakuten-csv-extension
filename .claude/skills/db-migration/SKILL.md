---
name: db-migration
description: |
  PostgreSQL マイグレーションの作成と実行。
  Use when: マイグレーション、テーブル作成、スキーマ変更を依頼された時。
---

# データベースマイグレーション

## マイグレーションファイル

### 配置場所
`backend/migrations/` ディレクトリ

### 命名規則
```
NNNN_<説明>.sql
例: 0004_create_dividends.sql
```

## 新規テーブル作成テンプレート

```sql
-- マイグレーション: テーブル名の説明
CREATE TABLE IF NOT EXISTS table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 他のカラム
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_table_name_user_id ON table_name(user_id);

-- ユニーク制約（重複防止用）
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_name_unique
ON table_name(user_id, some_column);
```

## 型マッピング

| Rust | PostgreSQL |
|------|------------|
| Uuid | UUID |
| String | TEXT / VARCHAR |
| i32 | INTEGER |
| i64 | BIGINT |
| f64 | DOUBLE PRECISION |
| NaiveDate | DATE |
| DateTime<Utc> | TIMESTAMPTZ |
| bool | BOOLEAN |

## マイグレーション実行

Shuttle は起動時に自動実行。ローカルでは：
```bash
sqlx migrate run
```

## 注意事項

- 本番DBに影響する変更は慎重に
- DROP TABLE は避け、必要なら別マイグレーションで
- 外部キー制約で `ON DELETE CASCADE` を適切に使用
