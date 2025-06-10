/**
 * Chrome拡張機能のメッセージ関連の型定義
 */
export interface ChromeMessage {
  action: string;
  payload?: Record<string, unknown>;
}

/**
 * CSVダウンロード関連のメッセージ
 */
export interface CsvDownloadMessage extends ChromeMessage {
  action: 'download-csv';
  payload: {
    message: string;
    downloadType?: 'dividend' | 'transaction' | 'all';
  };
}

/**
 * ダウンロードレスポンス
 */
export interface DownloadResponse {
  success: boolean;
  message?: string;
  error?: string;
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
