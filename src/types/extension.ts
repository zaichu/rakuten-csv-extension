import { CsvDownloadType } from "./rakuten";

/**
 * Chrome拡張機能のメッセージ関連の型定義
 */
export interface ChromeMessage {
  action: string;
  payload?: Record<string, unknown>;
}

/**
 * CSVダウンロード関連のメッセージ（Background経由）
 */
export interface CsvDownloadMessage extends ChromeMessage {
  action: 'download-csv-request';
  payload: {
    downloadType: CsvDownloadType;
    tabId?: number;
  };
}

/**
 * バックグラウンドからコンテンツスクリプトへのCSVダウンロード指示
 */
export interface CsvDownloadInstruction extends ChromeMessage {
  action: 'execute-csv-download';
  payload: {
    downloadType: CsvDownloadType;
    downloadStep: CsvDownloadStep;
  };
}

/**
 * CSVダウンロードのステップ定義
 */
export type CsvDownloadStep = 
  | 'navigate-to-page'       // ページに遷移
  | 'select-tab'            // タブ選択（実現損益用）
  | 'select-period'         // 期間選択
  | 'display-data'          // データ表示
  | 'download-csv';         // CSV保存

/**
 * ダウンロードレスポンス
 */
export interface DownloadResponse {
  success: boolean;
  message?: string;
  error?: string;
  step?: CsvDownloadStep;
  nextStep?: CsvDownloadStep;
}

/**
 * CSVダウンロード処理の設定
 */
export interface CsvDownloadConfig {
  downloadType: CsvDownloadType;
  steps: CsvDownloadStep[];
  selectors: {
    menuLink?: string;
    tabSelector?: string;
    periodRadio?: string;
    displayButton?: string;
    csvButton?: string;
  };
  description: string;
}

/**
 * アプリケーションの状態管理用の型
 */
export interface AppState {
  isDownloading: boolean;
  message: ApplicationMessage | null;
  downloadHistory: DownloadRecord[];
}

/**
 * ダウンロード履歴レコード
 */
export interface DownloadRecord {
  id: string;
  timestamp: Date;
  downloadType: string;
  status: 'success' | 'error';
  fileName?: string;
}

/**
 * アプリケーションメッセージ
 */
export interface ApplicationMessage {
  type: 'success' | 'error' | 'warning' | 'info';
  content: string;
  timestamp?: Date;
}
