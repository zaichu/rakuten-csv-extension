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
 * ページ遷移・ページ更新を伴い得るステップ
 *
 * 単独実行の対象。ステップ種の知識はここに寄せる。
 * 追加時はこの集合だけを変える。
 */
export const PAGE_TRANSITION_STEPS: ReadonlySet<CsvDownloadStep> = new Set([
  'navigate-to-page',
  'select-tab',
  'display-data'
]);

export function isPageTransitionStep(step: CsvDownloadStep): boolean {
  return PAGE_TRANSITION_STEPS.has(step);
}

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
    /**
     * CSVダウンロードのクリック直前にバックグラウンドへ通知するか
     *
     * 外部ページからの取得で、ダウンロード開始を待ち受ける場合だけtrueにする
     */
    readonly captureDownloadStart?: boolean;
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
    readonly captureDownloadStart?: boolean;
  };
}

export interface CheckCsvDownloadStepInstruction extends ChromeMessage {
  readonly action: 'check-csv-download-step';
  readonly payload: {
    readonly step: CsvDownloadStep;
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
 * ログイン状態の確認指示
 */
export interface CheckLoginStateInstruction extends ChromeMessage {
  readonly action: 'check-login-state';
}

/**
 * コンテンツスクリプトが受け取るメッセージ
 */
export type ContentScriptMessage =
  | CsvDownloadStepsInstruction
  | CheckCsvDownloadStepInstruction
  | ExtensionUpdatedMessage
  | CheckLoginStateInstruction
  | { readonly action: 'check-connection' };

/**
 * コンテンツスクリプト側で計測したステップの内訳
 */
export interface DownloadStepTiming {
  readonly phase: 'receive' | 'button-found' | 'click' | 'download-start' | 'action';
  readonly durationMs: number;
}

/**
 * 応答の共通形(success/error)
 */
interface BaseResponse {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * 種類付きの共通形
 */
interface WithKind {
  readonly kind: CsvDownloadType;
}

/**
 * 失敗理由の共通形
 */
interface WithReason {
  readonly reason: string;
  /** 失敗を区別するコード（画面が案内可以用） */
  readonly code?: string;
}

/**
 * ダウンロードレスポンス
 */
export interface DownloadResponse extends BaseResponse {
  readonly message?: string;
  readonly step?: CsvDownloadStep;
  readonly code?: string;
  /**
   * コンテンツスクリプトが受け取った時刻（service worker 側で送信からの時間を計算するため）
   */
  readonly receivedAt?: number;
  /**
   * コンテンツスクリプト側で計測した download-csv の内訳
   */
  readonly contentTimings?: readonly DownloadStepTiming[];
}

/**
 * ログイン状態の確認結果
 */
export interface LoginStateResponse extends BaseResponse {
  readonly loggedIn?: boolean;
}

/**
 * コンテンツスクリプトの応答
 */
export type ContentScriptResponse = DownloadResponse | LoginStateResponse;

/**
 * 画面(shoken-webapp)から届くCSV取得依頼
 */
export interface FetchLatestCsvRequest {
  readonly type: 'fetchLatestCsv';
  readonly kinds: readonly CsvDownloadType[];
}

/**
 * 取得の進行状況
 */
export type FetchLatestCsvProgressState = 'login-wait' | 'fetching' | 'completed' | 'failed';

/**
 * 画面へ返す進行状況
 */
export type FetchLatestCsvProgress = {
  readonly type: 'progress';
  readonly state: FetchLatestCsvProgressState;
} & Partial<WithKind> & Partial<Pick<WithReason, 'reason'>>;

/**
 * 取得できたCSV
 */
export interface FetchedCsv extends WithKind {
  readonly content: string;
  readonly fetchedAt: string;
  /** ダウンロードされたファイルを削除できたか */
  readonly fileRemoved?: boolean;
}

/**
 * 取得に失敗した種類と理由
 */
export interface FetchLatestCsvFailure extends WithKind, WithReason {}

/**
 * 取得処理の各段階の所要時間
 *
 * どこに時間がかかっているかを画面から確認するための計測値
 */
export interface FetchLatestCsvTiming {
  readonly stage: string;
  readonly durationMs: number;
}

/**
 * 取得結果
 */
export interface FetchLatestCsvResult {
  readonly type: 'result';
  readonly csvs: readonly FetchedCsv[];
  readonly failures: readonly FetchLatestCsvFailure[];
  readonly timings: readonly FetchLatestCsvTiming[];
}

/**
 * 受け付けなかった依頼に対する応答
 */
export interface ExternalErrorResponse {
  readonly type: 'error';
  readonly error: string;
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
 * CSVダウンロードのクリック直前 知らせるメッセージ
 */
export interface CsvDownloadWillStartMessage extends ChromeMessage {
  readonly action: 'csv-download-will-start';
}

/**
 * CSVダウンロードの実クリック直前を知らせるメッセージ
 */
export interface CsvDownloadClickedMessage extends ChromeMessage {
  readonly action: 'csv-download-clicked';
  readonly clickDurationMs?: number;
}

/**
 * バックグラウンドが受け取るメッセージ
 */
export type BackgroundMessage =
  | PageReadyMessage
  | CsvDownloadMessage
  | CsvDownloadWillStartMessage
  | CsvDownloadClickedMessage;
