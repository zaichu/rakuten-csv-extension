import type { CsvDownloadType } from './rakuten';

/**
 * セレクター定義（共通）
 */
export interface CsvSelectors {
  readonly menuLink?: string;
  readonly tabSelector?: string;
  readonly periodRadio?: string;
  readonly displayButton?: string;
  readonly csvButton?: string;
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
 * Chrome拡張機能のメッセージ基底型
 */
export interface ChromeMessage {
  readonly action: string;
  readonly payload?: Record<string, unknown>;
}

/**
 * CSVダウンロード関連のメッセージ（Background経由）
 */
export interface CsvDownloadMessage extends ChromeMessage {
  readonly action: 'download-csv-request';
  readonly payload: {
    readonly selectedOptions: ReadonlyArray<CsvDownloadType>;
    readonly tabId?: number;
  };
}

/**
 * バックグラウンドからコンテンツスクリプトへのCSVダウンロード指示
 *
 * 単一ステップの実行も1要素の配列として送る。
 */
export interface CsvDownloadStepsInstruction extends ChromeMessage {
  readonly action: 'execute-csv-download-steps';
  readonly payload: {
    readonly downloadSteps: readonly CsvDownloadStep[];
    readonly selectors: CsvSelectors;
  };
}

/**
 * 拡張機能更新通知メッセージ
 */
export interface ExtensionUpdatedMessage extends ChromeMessage {
  readonly action: 'extension-updated';
}

/**
 * 生存確認メッセージ
 */
export interface PingMessage extends ChromeMessage {
  readonly action: 'ping';
}

/**
 * コンテンツスクリプトが受け取るメッセージ
 */
export type ContentScriptMessage =
  | CsvDownloadStepsInstruction
  | ExtensionUpdatedMessage
  | PingMessage;

/**
 * ダウンロードレスポンス
 */
export interface DownloadResponse {
  readonly success: boolean;
  readonly message?: string;
  readonly error?: string;
  readonly step?: CsvDownloadStep;
}

/**
 * CSVダウンロード処理の設定
 */
export interface CsvDownloadConfig {
  readonly downloadType: CsvDownloadType;
  readonly steps: readonly CsvDownloadStep[];
  readonly selectors: CsvSelectors;
  readonly description: string;
}

/**
 * メッセージタイプ（共通）
 */
export type MessageType = 'success' | 'error' | 'warning' | 'info';

/**
 * アプリケーションメッセージ
 */
export interface ApplicationMessage {
  readonly type: MessageType;
  readonly content: string;
  readonly timestamp?: Date;
}

/**
 * 拡張機能の状態管理
 */
export interface ExtensionState {
  readonly activeTabId?: number;
  readonly rakutenTabs: ReadonlySet<number>;
  readonly lastActiveTime: number;
}

/**
 * ページ準備完了メッセージ
 *
 * 楽天証券タブの登録も兼ねる（登録専用のメッセージは設けない）。
 */
export interface PageReadyMessage extends ChromeMessage {
  readonly action: 'page-ready';
  readonly url: string;
}

/**
 * 拡張機能状態取得メッセージ
 */
export interface GetExtensionStateMessage extends ChromeMessage {
  readonly action: 'get-extension-state';
}

/**
 * バックグラウンドが受け取るメッセージ
 */
export type BackgroundMessage =
  | PageReadyMessage
  | CsvDownloadMessage
  | GetExtensionStateMessage;
