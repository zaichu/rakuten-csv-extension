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
    readonly selectedOptions: Set<CsvDownloadType>;
    readonly tabId?: number;
  };
}

/**
 * バックグラウンドからコンテンツスクリプトへのCSVダウンロード指示
 */
export interface CsvDownloadInstruction extends ChromeMessage {
  readonly action: 'execute-csv-download';
  readonly payload: {
    readonly downloadType: CsvDownloadType;
    readonly downloadStep: CsvDownloadStep;
    readonly selectors: CsvSelectors;
    readonly retryCount?: number;
  };
}

/**
 * ダウンロードレスポンス
 */
export interface DownloadResponse {
  readonly success: boolean;
  readonly message?: string;
  readonly error?: string;
  readonly step?: CsvDownloadStep;
  readonly nextStep?: CsvDownloadStep;
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
 * 基本ステータス（共通）
 */
export type BaseStatus = 'success' | 'error';

/**
 * アプリケーションメッセージ
 */
export interface ApplicationMessage {
  readonly type: MessageType;
  readonly content: string;
  readonly timestamp?: Date;
}

/**
 * ダウンロード履歴レコード
 */
export interface DownloadRecord {
  readonly id: string;
  readonly timestamp: Date;
  readonly downloadType: string;
  readonly status: BaseStatus;
  readonly fileName?: string;
}

/**
 * アプリケーションの状態管理用の型
 */
export interface AppState {
  readonly isDownloading: boolean;
  readonly message: ApplicationMessage | null;
  readonly downloadHistory: readonly DownloadRecord[];
}

/**
 * 楽天証券タブ情報
 */
export interface RakutenTabInfo {
  readonly tabId: number;
  readonly url: string;
  readonly timestamp: number;
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
 * Chrome拡張機能APIのレスポンス型
 */
export interface ChromeApiResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * DOM要素検索の設定
 */
export interface ElementSearchConfig {
  readonly selectors: readonly string[];
  readonly timeout?: number;
  readonly retryInterval?: number;
  readonly requireVisible?: boolean;
}

/**
 * タブ登録メッセージ
 */
export interface TabRegistrationMessage extends ChromeMessage {
  readonly action: 'register-rakuten-tab';
  readonly url: string;
  readonly timestamp: number;
}

/**
 * ページ準備完了メッセージ
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
