---
name: oauth-auth
description: |
  Google OAuth 認証とセッション管理の実装パターン。
  CSRF対策、Cookie設定、セッション検証を含む。
  Use when: 認証フロー修正、OAuth実装、セッション管理、Cookie設定を依頼された時。
---

# OAuth/認証 実装ガイド

## 目的

- OAuth 2.0 フロー（Google）を安全に実装する
- CSRF/state 検証を正しく行う
- Cookie 設定を環境に応じて適切に行う
- セッション管理を安全に実装する

## 適用場面

- OAuth 認証フローの新規実装・修正
- セッション管理の実装
- Cookie 設定の調整
- 認証関連のセキュリティ修正

## OAuth フロー

### 1. 認証開始（`/auth/google`）

```rust
pub async fn google_auth(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Result<(CookieJar, Redirect), ApiError> {
    let client = create_oauth_client(&state)?;

    // CSRF トークンを生成
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .url();

    // state を Cookie に保存（短い有効期限）
    let is_secure = is_secure_environment();
    let state_cookie = Cookie::build(("oauth_state", csrf_token.secret().to_string()))
        .path("/")
        .http_only(true)
        .secure(is_secure)
        .same_site(if is_secure { SameSite::None } else { SameSite::Lax })
        .max_age(time::Duration::minutes(10))
        .build();

    Ok((jar.add(state_cookie), Redirect::to(auth_url.as_str())))
}
```

### 2. コールバック（`/auth/google/callback`）

```rust
pub async fn google_callback(
    State(state): State<AppState>,
    Query(query): Query<AuthCallbackQuery>,
    jar: CookieJar,
) -> Result<Response, ApiError> {
    // CSRF トークンを検証（必須）
    let stored_state = jar
        .get("oauth_state")
        .map(|c| c.value().to_string())
        .ok_or_else(|| ApiError::Unauthorized("OAuth state が見つかりません".to_string()))?;

    if query.state != stored_state {
        return Err(ApiError::Unauthorized("OAuth state が一致しません".to_string()));
    }

    // state Cookie を削除
    let jar = jar.remove(Cookie::build(("oauth_state", "")).path("/").build());

    // トークン交換、ユーザー情報取得、セッション作成...
}
```

## Cookie 設定

### 環境判定

```rust
/// 本番環境（HTTPS）かどうかを判定
fn is_secure_environment() -> bool {
    // 明示的なフラグを優先
    if let Ok(secure) = std::env::var("SECURE_COOKIE") {
        return secure == "true" || secure == "1";
    }
    // BACKEND_URL のスキームで判定
    std::env::var("BACKEND_URL")
        .map(|url| url.starts_with("https://"))
        .unwrap_or(false)
}
```

### Cookie 属性

| 属性 | 開発環境 | 本番環境 | 理由 |
|------|----------|----------|------|
| `Secure` | false | true | HTTPS 必須 |
| `SameSite` | Lax | None | クロスオリジン対応 |
| `HttpOnly` | true | true | XSS 対策 |
| `Path` | "/" | "/" | 全パスで有効 |

## チェックリスト

### 認証開始時
- [ ] CSRF トークン（state）を生成している
- [ ] state を Cookie に保存している
- [ ] Cookie の有効期限は短い（10分程度）

### コールバック時
- [ ] state パラメータを受け取っている（Option ではなく必須）
- [ ] Cookie の state と照合している
- [ ] 検証後に state Cookie を削除している
- [ ] セッションを DB に保存している

### Cookie 設定
- [ ] `HttpOnly` が true
- [ ] 本番環境で `Secure` が true
- [ ] 本番環境で `SameSite=None`（クロスオリジン時）
- [ ] `is_secure_environment()` を使用（BACKEND_URL 有無だけで判定しない）

### セッション管理
- [ ] セッション ID は UUID（推測困難）
- [ ] 有効期限を設定している
- [ ] ログアウト時に DB から削除している

## よくある失敗

### 1. state を検証しない

```rust
// NG: state を無視
pub struct AuthCallbackQuery {
    pub code: String,
    #[allow(dead_code)]
    pub state: Option<String>,  // 使わない
}

// OK: state を必須で検証
pub struct AuthCallbackQuery {
    pub code: String,
    pub state: String,  // 必須
}
```

### 2. BACKEND_URL の有無だけで本番判定

```rust
// NG: ローカルで BACKEND_URL=http://localhost:3001 設定時に Secure=true になる
let is_production = std::env::var("BACKEND_URL").is_ok();

// OK: スキームを見る、または明示フラグを使う
let is_secure = std::env::var("BACKEND_URL")
    .map(|url| url.starts_with("https://"))
    .unwrap_or(false);
```

### 3. state Cookie を削除し忘れ

```rust
// NG: 検証後も Cookie が残る
if query.state != stored_state {
    return Err(...);
}
// この後、state Cookie を削除していない

// OK: 検証後に削除
let jar = jar.remove(Cookie::build(("oauth_state", "")).path("/").build());
```

## 環境変数

| 変数 | 用途 | 例 |
|------|------|-----|
| `GOOGLE_CLIENT_ID` | OAuth クライアント ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth クライアントシークレット | `GOCSPX-xxx` |
| `BACKEND_URL` | バックエンド URL | `https://api.example.com` |
| `FRONTEND_URL` | リダイレクト先 | `https://example.com` |
| `SECURE_COOKIE` | Cookie の Secure 属性を明示制御 | `true` |
| `RUST_ENV` / `APP_ENV` | 本番環境判定 | `production` |

## 参考ファイル

- `backend/src/handlers/auth.rs` - 認証ハンドラー
- `backend/src/extractors/auth.rs` - AuthenticatedUser エクストラクター
