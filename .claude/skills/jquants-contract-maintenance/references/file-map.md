# File Map

## Backend

- `backend/src/services/jquants.rs`
  - J-Quants 外部 API 呼び出し
- `backend/src/models/jquants.rs`
  - Rust 側の応答モデル
- `backend/src/handlers/jquants.rs`
  - 自アプリ API の handler
- `backend/src/openapi.rs`
  - OpenAPI へ露出する schema / path
- `backend/src/bin/generate_openapi.rs`
  - `docs/openapi.json` の再生成

## Frontend

- `frontend/src/generated/api.ts`
  - OpenAPI から生成される正規の API 型
- `frontend/src/features/jquants/api/types.ts`
  - hand-written 型。generated 型とズレやすい
- `frontend/src/features/jquants/api/client.ts`
  - backend の J-Quants route を呼ぶ client
- `frontend/src/features/jquants/hooks/useJQuantsDividend.ts`
  - 単一銘柄の配当 hook
- `frontend/src/features/jquants/hooks/useJQuantsDividendBatch.ts`
  - 複数銘柄の配当 hook
- `frontend/src/features/jquants/hooks/useDividendBatch.ts`
  - UI からの利用側 batch hook
- `frontend/src/components/molecules/DividendInfo/DividendInfo.tsx`
  - 配当 KPI 表示
- `frontend/src/pages/Receipt/Dividend.tsx`
  - 配当ページの consumer
- `frontend/src/pages/AssetBalance.tsx`
  - 保有銘柄ページの consumer

## Sync Path

1. `backend/src/models/jquants.rs`
2. `backend/src/handlers/jquants.rs`
3. `backend/src/openapi.rs`
4. `docs/openapi.json`
5. `frontend/src/generated/api.ts`
6. `frontend/src/features/jquants/*`
