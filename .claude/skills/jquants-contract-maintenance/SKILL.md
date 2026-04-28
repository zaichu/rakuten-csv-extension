---
name: jquants-contract-maintenance
description: J-Quants API の仕様差分、deserialize エラー、OpenAPI/generated type の不整合、frontend の配当表示崩れを調査して修正するための手順。J-Quants 関連ファイル、配当表示、外部 API 契約差分、型同期、V1→V2 移行、実レスポンス追従が必要なときに使う。
allowed-tools: Read, Grep, Glob, Bash
---

# J-Quants Contract Maintenance

## Overview

J-Quants 関連の不具合は、backend service / Rust model / OpenAPI / frontend generated type / consumer hook のどこかで契約がずれると連鎖して壊れる。まず契約差分を確定し、その後に backend と frontend の同期を一気に確認する。

## When to Use

- `missing field ...` のような deserialize エラーが出たとき
- frontend で `is not iterable` など J-Quants 応答 shape 不一致が出たとき
- J-Quants V1/V2 の仕様差分対応をするとき
- `backend/src/models/jquants.rs` や `frontend/src/features/jquants/` を触るとき
- backend の API 変更後に `docs/openapi.json` と `frontend/src/generated/api.ts` の同期が必要なとき

## Workflow

1. 症状を分類する
2. 契約の正本を確定する
3. backend の parser / model / route を合わせる
4. OpenAPI と generated type を再同期する
5. frontend hook / UI consumer を合わせる
6. 関連テストと同期チェックを実行する

## 1. 症状を分類する

- backend ログで失敗:
  - `missing field`, `invalid type`, `unknown variant`
  - まず `backend/src/models/jquants.rs` と `backend/src/services/jquants.rs` を確認
- frontend だけ失敗:
  - `statements is not iterable`, `undefined.data`, `map is not a function`
  - まず `frontend/src/features/jquants/api/types.ts`、`frontend/src/generated/api.ts`、consumer hook を確認
- API は成功だが表示だけ崩れる:
  - `frontend/src/features/jquants/hooks/` と `frontend/src/components/molecules/DividendInfo/DividendInfo.tsx`、`frontend/src/pages/Receipt/Dividend.tsx` を確認

症状別の詳細は [references/symptoms-and-fixes.md](references/symptoms-and-fixes.md) を読む。

## 2. 契約の正本を確定する

優先順:

1. 実際の J-Quants 応答
2. `backend/src/models/jquants.rs`
3. `backend/src/handlers/jquants.rs` と `backend/src/openapi.rs`
4. `docs/openapi.json`
5. `frontend/src/generated/api.ts`
6. `frontend/src/features/jquants/api/types.ts` と hook 群

注意:

- `frontend/src/features/jquants/api/types.ts` は hand-written 型なので、`frontend/src/generated/api.ts` と矛盾しやすい
- backend API を変えたら OpenAPI と frontend generated type の再生成を必ず行う
- frontend 側の一時対応で hand-written 型だけ直して終わらせない

関連ファイル一覧は [references/file-map.md](references/file-map.md) を読む。

## 3. backend を合わせる

最小確認範囲:

- `backend/src/services/jquants.rs`
- `backend/src/models/jquants.rs`
- `backend/src/handlers/jquants.rs`
- `backend/src/routes.rs`
- `backend/src/openapi.rs`

契約変更が API surface に出るなら:

- `#[utoipa::path]`
- schema 用 `ToSchema`
- `generate_openapi`

を一緒に更新する。

## 4. OpenAPI と generated type を再同期する

標準コマンド:

```bash
bash scripts/check-openapi.sh
```

個別実行:

```bash
cd backend && cargo run --bin generate_openapi
cd frontend && npm run generate:types
```

## 5. frontend を合わせる

優先確認:

- `frontend/src/features/jquants/api/client.ts`
- `frontend/src/features/jquants/api/types.ts`
- `frontend/src/features/jquants/hooks/useJQuantsDividend.ts`
- `frontend/src/features/jquants/hooks/useJQuantsDividendBatch.ts`
- `frontend/src/features/jquants/hooks/useDividendBatch.ts`
- `frontend/src/components/molecules/DividendInfo/DividendInfo.tsx`
- `frontend/src/pages/Receipt/Dividend.tsx`
- `frontend/src/pages/AssetBalance.tsx`

原則:

- backend route shape に frontend を寄せる
- generated type が使えるなら hand-written 型より generated type を優先する
- 一時的な `as any` は避ける

## 6. 検証

通常はまずこのスクリプトを使う:

```bash
bash .claude/skills/jquants-contract-maintenance/scripts/check_jquants_contract.sh
```

追加確認:

```bash
cd backend && cargo test jquants
cd frontend && npm test -- --run src/features/jquants/api/__tests__/client.test.ts src/features/jquants/hooks/__tests__/useJQuantsDividend.test.ts src/features/jquants/hooks/__tests__/useJQuantsDividendBatch.test.ts src/features/jquants/hooks/__tests__/useDividendBatch.test.ts
```

実 API まで確認したいときは `backend/src/services/jquants.rs` の ignored test を読む。通常実行には含めない。

## References

- ファイル配置と責務: [references/file-map.md](references/file-map.md)
- 症状別の当たり先: [references/symptoms-and-fixes.md](references/symptoms-and-fixes.md)
