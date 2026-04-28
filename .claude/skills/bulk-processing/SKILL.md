---
name: bulk-processing
description: |
  バルクデータ処理の最適化パターン。
  UNNEST、UPSERT、重複スキップ、パフォーマンス計測。
  Use when: 一括登録、バルク処理、CSV取り込み、大量データ処理を依頼された時。
---

# バルク処理 実装ガイド

## 目的

- 大量データを効率的に DB に登録する
- 重複データを適切に処理する（スキップまたは更新）
- パフォーマンスを計測し、ボトルネックを特定する

## 適用場面

- CSV ファイルからのデータ取り込み
- API からのバルクデータ登録
- 既存データの一括更新
- データ移行処理

## バルク INSERT パターン

### 1. UNNEST による一括挿入（推奨）

1回のクエリで全件挿入。ループより圧倒的に高速。

```rust
pub async fn bulk_create(
    State(state): State<AppState>,
    auth_user: AuthenticatedUser,
    ValidatedJson(data): ValidatedJson<BulkCreateRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let total = data.items.len();
    let start = Instant::now();

    if data.items.is_empty() {
        return Ok((StatusCode::CREATED, Json(BulkCreateResponse {
            inserted: 0,
            skipped: 0,
        })));
    }

    let user_id = auth_user.id();

    // 各フィールドを配列に変換
    let user_ids: Vec<uuid::Uuid> = vec![user_id; total];
    let field1s: Vec<&str> = data.items.iter().map(|i| i.field1.as_str()).collect();
    let field2s: Vec<f64> = data.items.iter().map(|i| i.field2).collect();

    // UNNEST でバルク INSERT（重複スキップ）
    let result = sqlx::query(
        r#"
        INSERT INTO your_table (user_id, field1, field2)
        SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::float8[])
        ON CONFLICT (user_id, field1) DO NOTHING
        "#,
    )
    .bind(&user_ids)
    .bind(&field1s)
    .bind(&field2s)
    .execute(&state.pool)
    .await?;

    let inserted = result.rows_affected() as usize;
    let skipped = total - inserted;
    let elapsed = start.elapsed();

    tracing::info!(
        "[bulk_create] 完了: inserted={}, skipped={}, 処理時間={:.2}ms",
        inserted, skipped, elapsed.as_secs_f64() * 1000.0
    );

    Ok((StatusCode::CREATED, Json(BulkCreateResponse { inserted, skipped })))
}
```

### 2. UPSERT（既存データを更新）

保有銘柄のように、同じキーで値を更新したい場合。

```rust
let result = sqlx::query(
    r#"
    INSERT INTO asset_balances (user_id, security_code, shares, current_price)
    SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::float8[], $4::float8[])
    ON CONFLICT (user_id, security_code)
    DO UPDATE SET
        shares = EXCLUDED.shares,
        current_price = EXCLUDED.current_price,
        updated_at = NOW()
    "#,
)
.bind(&user_ids)
.bind(&security_codes)
.bind(&shares)
.bind(&current_prices)
.execute(&state.pool)
.await?;

// UPSERT では skipped は常に 0（更新も rows_affected に含まれる）
let inserted = result.rows_affected() as usize;
```

## PostgreSQL 型マッピング（UNNEST 用）

| Rust 型 | PostgreSQL キャスト |
|---------|---------------------|
| `Vec<uuid::Uuid>` | `$1::uuid[]` |
| `Vec<&str>` / `Vec<String>` | `$1::text[]` |
| `Vec<f64>` | `$1::float8[]` |
| `Vec<i32>` | `$1::int4[]` |
| `Vec<i64>` | `$1::int8[]` |
| `Vec<NaiveDate>` | `$1::date[]` |
| `Vec<bool>` | `$1::bool[]` |

## チェックリスト

### 実装前
- [ ] ユニーク制約を確認（ON CONFLICT の対象キー）
- [ ] 重複時の挙動を決定（スキップ or 更新）
- [ ] バリデーションを実装（空配列、フィールド長など）

### 実装時
- [ ] UNNEST を使用（ループ処理は避ける）
- [ ] 処理時間を計測してログ出力
- [ ] inserted/skipped を正確に計算

### テスト
- [ ] 空配列の場合のテスト
- [ ] 重複データ挿入時のテスト
- [ ] 大量データ（1000件以上）でのパフォーマンス確認

## よくある失敗

### 1. ループで1件ずつ INSERT

```rust
// NG: N回のクエリ発行で遅い
for item in payload.items {
    sqlx::query("INSERT INTO ...")
        .bind(...)
        .execute(&pool)
        .await?;
}

// OK: 1回のクエリで全件挿入
sqlx::query("INSERT INTO ... SELECT * FROM UNNEST(...)")
    .bind(&all_values)
    .execute(&pool)
    .await?;
```

### 2. ON CONFLICT の対象キーが PK と不一致

```sql
-- NG: PK が (date, code) なのに code のみ指定
ON CONFLICT (code) DO NOTHING

-- OK: PK に合わせる
ON CONFLICT (date, code) DO NOTHING
```

### 3. rows_affected の解釈ミス

```rust
// UPSERT の場合、UPDATE も rows_affected に含まれる
// → skipped = total - inserted は意味がない

// 正しい解釈
let upserted = result.rows_affected() as usize;  // INSERT + UPDATE の合計
let skipped = 0;  // UPSERT では常に 0
```

### 4. 空配列チェック漏れ

```rust
// NG: 空配列で UNNEST するとエラー
let result = sqlx::query("INSERT INTO ... SELECT * FROM UNNEST($1::uuid[])")
    .bind(&vec![] as &Vec<uuid::Uuid>)  // 空配列
    .execute(&pool)
    .await?;

// OK: 事前にチェック
if data.items.is_empty() {
    return Ok(Json(BulkCreateResponse { inserted: 0, skipped: 0 }));
}
```

## パフォーマンス目安

| 件数 | 処理時間（目安） |
|------|------------------|
| 100件 | < 50ms |
| 1,000件 | < 200ms |
| 10,000件 | < 1s |

※ Neon PostgreSQL（サーバーレス）の場合。接続プールの状態により変動。

## レスポンス形式

```rust
#[derive(Debug, Serialize)]
pub struct BulkCreateResponse {
    pub inserted: usize,  // 新規挿入件数
    pub skipped: usize,   // 重複スキップ件数（UPSERT では 0）
}
```

フロントエンドでの表示例:
```
100件中 95件を登録しました（5件は重複のためスキップ）
```

## 参考ファイル

- `backend/src/handlers/dividend.rs` - 重複スキップパターン
- `backend/src/handlers/asset_balance.rs` - UPSERT パターン
- `backend/src/bin/import_csv.rs` - バッチ処理パターン
