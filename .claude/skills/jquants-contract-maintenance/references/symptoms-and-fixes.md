# Symptoms and Fixes

## `missing field ...`

見る場所:

- `backend/src/models/jquants.rs`
- `backend/src/services/jquants.rs`

原因の典型:

- API の field 名変更
- optional / required の取り違え
- V1/V2 の field 命名混在

## `... is not iterable`

見る場所:

- `frontend/src/features/jquants/api/types.ts`
- `frontend/src/generated/api.ts`
- hook 側の `response.data` / `response.statements` 参照

原因の典型:

- frontend が古い response shape を読んでいる
- generated type 再生成漏れ

## backend は成功、UI 表示だけ壊れる

見る場所:

- `frontend/src/components/molecules/DividendInfo/DividendInfo.tsx`
- `frontend/src/pages/Receipt/Dividend.tsx`
- `frontend/src/pages/AssetBalance.tsx`

原因の典型:

- hook の返り値 shape は合っているが consumer の前提が古い
- `Map` / 配列 / 単一値の変換漏れ

## fix の順番

1. 実 API か backend route のどちらを正本にするか決める
2. backend model / handler を合わせる
3. OpenAPI と generated type を再生成する
4. frontend hand-written 型と consumer を合わせる
5. テストと同期チェックを回す
