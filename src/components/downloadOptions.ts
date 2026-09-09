import type { CsvDownloadType } from '../types';

/**
 * ダウンロードオプションのカテゴリ
 */
export type DownloadCategory = 'portfolio' | 'transaction' | 'income';

/**
 * CSV ダウンロードオプション
 */
export interface DownloadOption {
  readonly id: CsvDownloadType;
  readonly label: string;
  readonly icon: string;
  readonly category: DownloadCategory;
}

/**
 * カテゴリの表示定義（ラベル・アイコンを1箇所に統合）
 */
export const CATEGORY_META: Record<DownloadCategory, { readonly label: string; readonly icon: string }> = {
  portfolio: { label: 'ポートフォリオ', icon: '📈' },
  transaction: { label: '取引履歴', icon: '📊' },
  income: { label: '収益情報', icon: '💰' },
} as const;

/**
 * ダウンロードオプションの定義
 */
export const DOWNLOAD_OPTIONS: readonly DownloadOption[] = [
  {
    id: 'assetbalance',
    label: '国内株式',
    icon: '📊',
    category: 'portfolio'
  },
  {
    id: 'dividend',
    label: '配当金・分配金',
    icon: '💰',
    category: 'income'
  },
  {
    id: 'domesticstock',
    label: '国内株式',
    icon: '📋',
    category: 'transaction'
  },
  {
    id: 'mutualfund',
    label: '投資信託',
    icon: '📋',
    category: 'transaction'
  }
] as const;

/**
 * カテゴリ別にグループ化されたオプション
 */
export const CATEGORIZED_OPTIONS: Record<string, DownloadOption[]> = {
  portfolio: DOWNLOAD_OPTIONS.filter(opt => opt.category === 'portfolio'),
  income: DOWNLOAD_OPTIONS.filter(opt => opt.category === 'income'),
  transaction: DOWNLOAD_OPTIONS.filter(opt => opt.category === 'transaction')
};

/**
 * カテゴリの表示名を取得
 */
export const getCategoryLabel = (category: string): string => {
  return CATEGORY_META[category as DownloadCategory]?.label || category;
};

/**
 * カテゴリのアイコンを取得
 */
export const getCategoryIcon = (category: string): string => {
  return CATEGORY_META[category as DownloadCategory]?.icon || '📋';
};
