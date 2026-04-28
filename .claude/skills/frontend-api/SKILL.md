---
name: frontend-api
description: |
  React フロントエンドの API クライアント実装パターン。
  axios、型定義、認証付きリクエスト。
  Use when: API呼び出し、フェッチ処理、APIクライアント作成を依頼された時。
---

# フロントエンド API 実装

## API クライアント構造

```typescript
// api/yourApi.ts
import { apiClient } from '@/lib/apiClient';

export interface YourData {
  id: string;
  field1: string;
  field2: number;
}

export interface BulkCreateResponse {
  inserted: number;
  total: number;
}

export const yourApi = {
  list: () =>
    apiClient.get<YourData[]>('/your-route', { withCredentials: true }),

  bulkCreate: (items: Omit<YourData, 'id'>[]) =>
    apiClient.post<BulkCreateResponse>(
      '/your-route/bulk',
      { items },
      { withCredentials: true }
    ),

  deleteAll: () =>
    apiClient.delete('/your-route/all', { withCredentials: true }),
};
```

## データ取得フック

```typescript
// hooks/useYourData.ts
import { useState, useEffect } from 'react';
import { yourApi, YourData } from '@/api/yourApi';
import { useAuth } from '@/hooks/useAuth';

export function useYourData() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<YourData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await yourApi.list();
        setData(response.data);
      } catch (e) {
        setError('データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAuthenticated]);

  return { data, loading, error, setData };
}
```

## 日付変換

```typescript
// DB から取得した日付文字列を Date に変換
export function transformDBData(dbItem: DBYourData): YourData {
  return {
    ...dbItem,
    date: new Date(dbItem.date),
  };
}
```

## withCredentials

認証が必要なリクエストには必ず `withCredentials: true` を付与。
Cookie ベースのセッション認証で必要。
