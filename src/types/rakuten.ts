/**
 * 楽天証券固有の型定義
 */

/**
 * 楽天証券のページタイプ
 */
export type RakutenPageType = 'dividend' | 'transaction' | 'portfolio' | 'unknown';

/**
 * CSVダウンロードタイプ
 */
export type CsvDownloadType = 'assetbalance' | 'dividend' | 'domesticstock' | 'mutualfund'

/**
 * 楽天証券のURL設定
 */
export interface RakutenUrlConfig {
  baseUrl: string;
  dividendPage: string;
  transactionPage: string;
  portfolioPage: string;
}

/**
 * ダウンロード設定
 */
export interface DownloadConfig {
  autoDownload: boolean;
  downloadPath: string;
  fileNameFormat: string;
  includeDateInFileName: boolean;
}

/**
 * 拡張機能の設定
 */
export interface ExtensionSettings {
  autoOpenRakuten: boolean;
  showNotifications: boolean;
  downloadConfig: DownloadConfig;
  theme: 'light' | 'dark' | 'auto';
}
