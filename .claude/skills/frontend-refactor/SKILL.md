---
name: frontend-refactor
description: |
  フロントエンドリファクタリングのパターン。
  共通フック化、設定テーブル化、コンポーネント分割。
  Use when: リファクタ、共通化、コード整理、重複削減を依頼された時。
---

# フロントエンド リファクタリングガイド

## 目的

- 重複コードを共通化して保守性を向上
- 条件分岐を設定テーブルに置き換えて可読性を向上
- 責務を分離してテスタビリティを向上

## 適用場面

- 類似コンポーネントが複数存在する
- switch 文や if-else が長くなっている
- 同じロジックが複数箇所にコピーされている
- コンポーネントが肥大化している

## パターン 1: 共通フック化

### Before（重複したデータ取得ロジック）

```typescript
// Dividend.tsx
const [dividends, setDividends] = useState<Dividend[]>([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  if (!isAuthenticated) return;
  setLoading(true);
  dividendApi.list()
    .then(res => setDividends(res.data))
    .finally(() => setLoading(false));
}, [isAuthenticated]);

// DomesticStock.tsx
const [stocks, setStocks] = useState<DomesticStock[]>([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  if (!isAuthenticated) return;
  setLoading(true);
  domesticStockApi.list()
    .then(res => setStocks(res.data))
    .finally(() => setLoading(false));
}, [isAuthenticated]);
```

### After（共通フック）

```typescript
// hooks/useDataSource.ts
export function useDataSource<T, R = T>(
  fetchFn: () => Promise<AxiosResponse<T[]>>,
  options?: {
    transform?: (item: T) => R;
    enabled?: boolean;
  }
) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<R[]>([]);
  const [dbData, setDbData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  const enabled = options?.enabled ?? isAuthenticated;

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetchFn()
      .then(res => {
        setDbData(res.data);
        setData(options?.transform
          ? res.data.map(options.transform)
          : res.data as unknown as R[]);
      })
      .finally(() => setLoading(false));
  }, [enabled]);

  return { data, setData, dbData, loading };
}

// Dividend.tsx
const { data: dividends, loading } = useDataSource(dividendApi.list);

// DomesticStock.tsx
const { data: stocks, loading } = useDataSource(domesticStockApi.list);
```

## パターン 2: 設定テーブル化

### Before（長い switch 文）

```typescript
function getExternalLinks(securityCode: string, type: string) {
  switch (type) {
    case 'kabutan':
      return `https://kabutan.jp/stock/?code=${securityCode}`;
    case 'yahoo':
      return `https://finance.yahoo.co.jp/quote/${securityCode}`;
    case 'minkabu':
      return `https://minkabu.jp/stock/${securityCode}`;
    case 'buffett':
      return `https://www.buffett-code.com/company/${securityCode}`;
    default:
      return '';
  }
}
```

### After（設定テーブル）

```typescript
// config/externalLinks.ts
export const EXTERNAL_LINK_CONFIG = {
  kabutan: {
    label: '株探',
    getUrl: (code: string) => `https://kabutan.jp/stock/?code=${code}`,
    icon: '📊',
  },
  yahoo: {
    label: 'Yahoo!ファイナンス',
    getUrl: (code: string) => `https://finance.yahoo.co.jp/quote/${code}`,
    icon: '📈',
  },
  minkabu: {
    label: 'みんかぶ',
    getUrl: (code: string) => `https://minkabu.jp/stock/${code}`,
    icon: '👥',
  },
  buffett: {
    label: 'バフェット・コード',
    getUrl: (code: string) => `https://www.buffett-code.com/company/${code}`,
    icon: '💼',
  },
} as const;

// 使用側
function getExternalLinks(securityCode: string, type: keyof typeof EXTERNAL_LINK_CONFIG) {
  return EXTERNAL_LINK_CONFIG[type]?.getUrl(securityCode) ?? '';
}
```

## パターン 3: 検索フィルタリングの共通化

### Before（各コンポーネントで重複）

```typescript
// Dividend.tsx
const filteredDividends = dividends.filter(d =>
  d.securityCode.includes(searchQuery) ||
  d.securityName.toLowerCase().includes(searchQuery.toLowerCase())
);

// DomesticStock.tsx
const filteredStocks = stocks.filter(s =>
  s.securityCode.includes(searchQuery) ||
  s.securityName.toLowerCase().includes(searchQuery.toLowerCase())
);
```

### After（共通ユーティリティ）

```typescript
// utils/filterBySearch.ts
export function filterBySearch<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => string[]
): T[] {
  if (!query.trim()) return items;

  const normalizedQuery = query.toLowerCase();
  return items.filter(item =>
    getSearchableFields(item).some(field =>
      field.toLowerCase().includes(normalizedQuery)
    )
  );
}

// Dividend.tsx
const filteredDividends = filterBySearch(
  dividends,
  searchQuery,
  d => [d.securityCode, d.securityName]
);

// DomesticStock.tsx
const filteredStocks = filterBySearch(
  stocks,
  searchQuery,
  s => [s.securityCode, s.securityName]
);
```

## チェックリスト

### リファクタ前
- [ ] 重複箇所を特定した
- [ ] 共通化の粒度を決定した（過度な抽象化を避ける）
- [ ] 既存のテストがあれば確認した

### リファクタ中
- [ ] 1つの変更に集中している（複数の改善を混ぜない）
- [ ] 型安全性を維持している
- [ ] エッジケース（空配列、null など）を考慮した

### リファクタ後
- [ ] 動作確認を行った
- [ ] 既存の機能が壊れていないことを確認した
- [ ] コード量が減っている（または可読性が向上している）

## よくある失敗

### 1. 過度な抽象化

```typescript
// NG: 2箇所しか使わないのに汎用フックを作る
function useGenericDataFetcher<T, R, E, O>(
  fetchFn: () => Promise<T>,
  transformFn: (data: T) => R,
  errorHandler: (e: E) => void,
  options: O
) { ... }

// OK: シンプルに必要な分だけ
function useDataSource<T>(fetchFn: () => Promise<AxiosResponse<T[]>>) { ... }
```

### 2. 設定と実装の混在

```typescript
// NG: 設定の中にロジックを埋め込む
const CONFIG = {
  dividend: {
    process: (data) => { /* 複雑なロジック */ },
  },
};

// OK: 設定は純粋なデータ、ロジックは別の関数に
const CONFIG = {
  dividend: { label: '配当金', apiPath: '/dividends' },
};
function processDividend(data: Dividend[]) { /* ロジック */ }
```

### 3. 型安全性の喪失

```typescript
// NG: any を使って型チェックを回避
function useDataSource(fetchFn: () => Promise<any>) { ... }

// OK: ジェネリクスで型を維持
function useDataSource<T>(fetchFn: () => Promise<AxiosResponse<T[]>>) { ... }
```

### 4. 変更の混在

```typescript
// NG: リファクタとバグ修正を同時に行う
// - 共通フック化
// - ついでにバグ修正
// - ついでにスタイル変更

// OK: リファクタのみに集中、他は別コミットで
```

## 判断基準

| 状況 | 共通化する | しない |
|------|-----------|--------|
| 3箇所以上で同じコード | ✅ | - |
| 2箇所で同じコード | △ 将来増えそうなら | △ 増えないなら |
| 1箇所のみ | - | ✅ |
| 複雑なロジック | ✅ テストしやすくなる | - |
| 単純な1行処理 | - | ✅ インライン維持 |

## 参考ファイル

- `frontend/src/hooks/useDataSource.ts` - データ取得共通フック
- `frontend/src/utils/filterBySearch.ts` - 検索フィルタリング
- `frontend/src/config/` - 設定テーブル
