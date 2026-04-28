---
name: backend-api
description: |
  Axum REST API エンドポイントの実装パターン。
  認証付きCRUD、バリデーション、エラーハンドリング。
  Use when: API追加、エンドポイント実装、ハンドラー作成を依頼された時。
---

# バックエンド API 実装

## ハンドラー構造

```rust
use axum::{extract::State, response::IntoResponse, Json};
use crate::{
    errors::ApiError,
    extractors::auth::AuthenticatedUser,
    models::YourModel,
    state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    auth_user: AuthenticatedUser,
) -> Result<impl IntoResponse, ApiError> {
    let items = sqlx::query_as!(
        YourModel,
        "SELECT * FROM your_table WHERE user_id = $1",
        auth_user.id()
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(items))
}
```

## ルート登録 (main.rs)

```rust
use axum::routing::{get, post, delete};

let app = Router::new()
    .route("/your-route", get(handlers::your::list))
    .route("/your-route/bulk", post(handlers::your::bulk_create))
    .route("/your-route/all", delete(handlers::your::delete_all));
```

## モデル定義

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct YourModel {
    pub id: Uuid,
    #[serde(skip_serializing)]
    #[allow(dead_code)]
    pub user_id: Uuid,
    // 他のフィールド
}

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    // リクエストフィールド
}
```

## バルク作成（重複スキップ）

```rust
pub async fn bulk_create(
    State(state): State<AppState>,
    auth_user: AuthenticatedUser,
    Json(payload): Json<BulkCreateRequest>,
) -> Result<impl IntoResponse, ApiError> {
    let mut inserted = 0;
    for item in payload.items {
        let result = sqlx::query!(
            r#"
            INSERT INTO your_table (user_id, field1, field2)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            "#,
            auth_user.id(),
            item.field1,
            item.field2
        )
        .execute(&state.pool)
        .await?;

        if result.rows_affected() > 0 {
            inserted += 1;
        }
    }

    Ok(Json(BulkCreateResponse {
        inserted,
        total: payload.items.len(),
    }))
}
```

## J-Quants API V2 連携

### フィールド名の注意点

J-Quants API V2 は省略形フィールド名を使用。`serde(rename)` で正確に指定する必要がある。

| 項目 | API V2 フィールド名 |
|------|-------------------|
| 営業利益 | `OP` |
| 経常利益 | `OdP` |
| 当期純利益 | `NP` |
| 当期種別 | `CurPerType` |
| 当期開始日 | `CurPerSt` |
| 期末配当 | `DivFY` |
| 年間配当実績 | `DivAnn` |
| 年間配当予想 | `FDivAnn` |
| 年間配当来期予想 | `NxFDivAnn` |

### 型定義例

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct FinSummaryData {
    #[serde(rename = "DiscDate")]
    pub disclosed_date: String,

    #[serde(rename = "OP", default)]
    pub operating_profit: Option<String>,

    #[serde(rename = "NxFDivAnn", default)]
    pub next_year_forecast_dividend_per_share_annual: Option<String>,
}
```

### フロントエンドでの防御的コーディング

APIレスポンスの `data` フィールドが配列でない場合に備える：

```typescript
if (!response?.data || !Array.isArray(response.data)) {
  return;
}
for (const item of response.data) {
  // 処理
}
```
