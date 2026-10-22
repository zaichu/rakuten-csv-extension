/**
 * 外部ページ(shoken-webapp)からのCSV取得依頼を処理する
 *
 * 接続元のオリジン検査、依頼の検証、ログイン待ち、
 * 種類ごとの取得と進捗通知を担う。
 */

import type {
  ChromeMessage,
  CsvDownloadMessage,
  CsvDownloadType,
  CsvContentResponse,
  DownloadResponse,
  ExternalErrorResponse,
  FetchLatestCsvFailure,
  FetchLatestCsvProgress,
  FetchLatestCsvRequest,
  FetchLatestCsvResult,
  FetchedCsv,
  LoginStateResponse,
} from '../types';
import { CSV_DOWNLOAD_CONFIGS } from '../config/csvDownloadConfigs';
import { RakutenUtils, sleep } from '../utils';

/**
 * CSVダウンロード手順の実行口
 */
export interface CsvDownloadRunner {
  executeDownloadRequest(message: CsvDownloadMessage): Promise<DownloadResponse>;
}

export interface ExternalRequestHandlerConfig {
  /** CSVダウンロード手順の実行 */
  readonly downloadRunner: CsvDownloadRunner;
  /** 接続を許可するオリジンのマッチパターン（既定は manifest の externally_connectable） */
  readonly allowedOrigins?: readonly string[];
  /** ログイン完了を待つ最大時間(ms) */
  readonly loginWaitTimeoutMs?: number;
  /** ログイン状態の確認間隔(ms) */
  readonly loginPollIntervalMs?: number;
  /** ダウンロード開始を待つ最大時間(ms) */
  readonly downloadStartTimeoutMs?: number;
  /** タブの読み込み完了を待つ最大時間(ms) */
  readonly tabLoadTimeoutMs?: number;
}

const DEFAULT_LOGIN_WAIT_TIMEOUT_MS = 180_000;
const DEFAULT_LOGIN_POLL_INTERVAL_MS = 2_000;
const DEFAULT_DOWNLOAD_START_TIMEOUT_MS = 10_000;
const DEFAULT_TAB_LOAD_TIMEOUT_MS = 30_000;

/**
 * 許可するオリジンのパターンを manifest から読む
 */
export function readAllowedOrigins(): readonly string[] {
  const manifest = chrome.runtime.getManifest() as unknown as {
    readonly externally_connectable?: { readonly matches?: readonly string[] };
  };
  return manifest.externally_connectable?.matches ?? [];
}

/**
 * 接続元のオリジンが許可されているか
 *
 * Chrome のマッチパターンはポート番号を区別しないため、オリジンのホスト名だけで比較する
 */
export function isAllowedOrigin(origin: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesOriginPattern(pattern, origin));
}

function matchesOriginPattern(pattern: string, origin: string): boolean {
  const matched = /^([a-z]+):\/\/([^/]+)\//.exec(pattern);
  if (!matched) {
    return false;
  }
  const [, scheme, host] = matched;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  if (originUrl.protocol !== `${scheme}:`) {
    return false;
  }
  return originUrl.hostname.toLowerCase() === host.toLowerCase();
}

/**
 * 取得依頼の検証
 */
export function parseFetchLatestCsvRequest(message: unknown): FetchLatestCsvRequest | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }

  const { type, kinds } = message as { readonly type?: unknown; readonly kinds?: unknown };
  if (type !== 'fetchLatestCsv') {
    return null;
  }
  if (!Array.isArray(kinds) || kinds.length === 0) {
    return null;
  }
  if (!kinds.every((kind) => isCsvDownloadType(kind))) {
    return null;
  }

  return { type: 'fetchLatestCsv', kinds: kinds as readonly CsvDownloadType[] };
}

function isCsvDownloadType(value: unknown): value is CsvDownloadType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CSV_DOWNLOAD_CONFIGS, value);
}

/**
 * 外部ページ(shoken-webapp)への応答
 */
export class ExternalRequestHandler {
  private readonly downloadRunner: CsvDownloadRunner;
  private readonly allowedOrigins?: readonly string[];
  private readonly loginWaitTimeoutMs: number;
  private readonly loginPollIntervalMs: number;
  private readonly downloadStartTimeoutMs: number;
  private readonly tabLoadTimeoutMs: number;

  constructor(config: ExternalRequestHandlerConfig) {
    this.downloadRunner = config.downloadRunner;
    this.allowedOrigins = config.allowedOrigins;
    this.loginWaitTimeoutMs = config.loginWaitTimeoutMs ?? DEFAULT_LOGIN_WAIT_TIMEOUT_MS;
    this.loginPollIntervalMs = config.loginPollIntervalMs ?? DEFAULT_LOGIN_POLL_INTERVAL_MS;
    this.downloadStartTimeoutMs = config.downloadStartTimeoutMs ?? DEFAULT_DOWNLOAD_START_TIMEOUT_MS;
    this.tabLoadTimeoutMs = config.tabLoadTimeoutMs ?? DEFAULT_TAB_LOAD_TIMEOUT_MS;
  }

  /**
   * 外部ページからの接続を処理する
   */
  handleConnection(port: chrome.runtime.Port): void {
    const origin = this.getSenderOrigin(port.sender);
    if (!this.isAllowedOrigin(origin)) {
      port.postMessage(errorResponse('接続元のオリジンが許可されていません'));
      port.disconnect();
      return;
    }

    port.onMessage.addListener((message: unknown) => {
      void this.handleRequest(port, message);
    });
  }

  /**
   * 依頼の検証と取得の実行
   */
  private async handleRequest(port: chrome.runtime.Port, message: unknown): Promise<void> {
    const request = parseFetchLatestCsvRequest(message);
    if (!request) {
      port.postMessage(errorResponse('取得依頼の形式が正しくありません'));
      return;
    }

    try {
      const result = await this.fetchLatestCsv(request.kinds, (progress) => {
        port.postMessage(progress);
      });
      port.postMessage(result);
    } catch {
      port.postMessage(errorResponse('CSVの取得中に予期しないエラーが発生しました'));
    }
  }

  /**
   * 種類ごとの取得
   */
  private async fetchLatestCsv(
    kinds: readonly CsvDownloadType[],
    notify: (progress: FetchLatestCsvProgress) => void
  ): Promise<FetchLatestCsvResult> {
    const csvs: FetchedCsv[] = [];
    const failures: FetchLatestCsvFailure[] = [];

    const tabId = await this.ensureRakutenTab();
    if (tabId === undefined) {
      return {
        type: 'result',
        csvs,
        failures: kinds.map((kind) => ({ kind, reason: '楽天証券のタブを開けませんでした' })),
      };
    }

    const loggedIn = await this.waitForLogin(tabId, notify);
    if (!loggedIn) {
      return {
        type: 'result',
        csvs,
        failures: kinds.map((kind) => ({ kind, reason: 'ログインが完了しませんでした' })),
      };
    }

    for (const kind of kinds) {
      notify({ type: 'progress', state: 'fetching', kind });

      const outcome = await this.fetchKind(tabId, kind);
      if (outcome.success) {
        csvs.push(outcome.csv);
        notify({ type: 'progress', state: 'completed', kind });
      } else {
        failures.push({ kind, reason: outcome.reason });
        notify({ type: 'progress', state: 'failed', kind, reason: outcome.reason });
      }
    }

    return { type: 'result', csvs, failures };
  }

  /**
   * 1種類のCSVを取得する
   */
  private async fetchKind(
    tabId: number,
    kind: CsvDownloadType
  ): Promise<{ success: true; csv: FetchedCsv } | { success: false; reason: string }> {
    // クリックで発生するダウンロードのURLを捕捉するため、実行前に待ち受けを準備する
    const capture = this.captureDownloadUrl();

    const stepResult = await this.downloadRunner.executeDownloadRequest({
      action: 'download-csv-request',
      payload: { selectedOptions: [kind], tabId },
    });

    if (!stepResult.success) {
      capture.cancel();
      return { success: false, reason: stepResult.error ?? 'CSVの取得に失敗しました' };
    }

    const downloadUrl = await capture.url;
    if (!downloadUrl) {
      return { success: false, reason: 'CSVのダウンロード先URLを取得できませんでした' };
    }

    const content = await this.fetchCsvContent(tabId, downloadUrl);
    if (!content.success) {
      return { success: false, reason: content.reason };
    }

    return {
      success: true,
      csv: { kind, content: content.content, fetchedAt: new Date().toISOString() },
    };
  }

  /**
   * ダウンロードの開始を待ち、URLを捕捉する
   */
  private captureDownloadUrl(): { readonly url: Promise<string | undefined>; readonly cancel: () => void } {
    let resolveUrl: (url: string | undefined) => void = () => {};
    const url = new Promise<string | undefined>((resolve) => {
      resolveUrl = resolve;
    });

    const finish = (value: string | undefined): void => {
      chrome.downloads.onCreated.removeListener(listener);
      clearTimeout(timer);
      resolveUrl(value);
    };

    const listener = (item: chrome.downloads.DownloadItem): void => {
      if (!isCapturableDownloadUrl(item.url)) {
        return;
      }
      finish(item.url);
    };

    const timer = setTimeout(() => finish(undefined), this.downloadStartTimeoutMs);
    chrome.downloads.onCreated.addListener(listener);

    return { url, cancel: () => finish(undefined) };
  }

  /**
   * ダウンロードされたCSVの本文をページ文脈で取得する
   */
  private async fetchCsvContent(
    tabId: number,
    url: string
  ): Promise<{ success: true; content: string } | { success: false; reason: string }> {
    const response = await this.sendToContentScript(tabId, {
      action: 'fetch-csv-content',
      payload: { url },
    });

    if (!isCsvContentResponse(response)) {
      return { success: false, reason: 'CSV本文の取得に失敗しました' };
    }
    if (!response.success || response.content === undefined) {
      return { success: false, reason: response.error ?? 'CSV本文の取得に失敗しました' };
    }
    return { success: true, content: response.content };
  }

  /**
   * ログイン完了を待つ
   */
  private async waitForLogin(
    tabId: number,
    notify: (progress: FetchLatestCsvProgress) => void
  ): Promise<boolean> {
    if (await this.isLoggedIn(tabId)) {
      return true;
    }

    notify({ type: 'progress', state: 'login-wait' });
    await this.openRakutenPage(tabId);

    const deadline = Date.now() + this.loginWaitTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(this.loginPollIntervalMs);
      if (await this.isLoggedIn(tabId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * ログイン状態の確認
   */
  private async isLoggedIn(tabId: number): Promise<boolean> {
    const response = await this.sendToContentScript(tabId, { action: 'check-login-state' });
    if (!isLoginStateResponse(response)) {
      return false;
    }
    return response.loggedIn === true;
  }

  /**
   * 楽天証券のタブを用意する
   */
  private async ensureRakutenTab(): Promise<number | undefined> {
    const existing = await this.findRakutenTab();
    if (existing !== undefined) {
      return existing;
    }

    const tab = await this.createRakutenTab();
    if (tab?.id === undefined) {
      return undefined;
    }

    await this.waitForTabLoad(tab.id);
    return tab.id;
  }

  private async findRakutenTab(): Promise<number | undefined> {
    const tabs = await chrome.tabs.query({ url: '*://*.rakuten-sec.co.jp/*' });
    const tab = tabs.find((candidate) => candidate.active) ?? tabs[0];
    return tab?.id;
  }

  private createRakutenTab(): Promise<chrome.tabs.Tab | undefined> {
    return new Promise((resolve) => {
      chrome.tabs.create({ url: RakutenUtils.BASE_URL, active: true }, (tab) => {
        // lastError を読むことで未処理エラーの警告を避ける
        void chrome.runtime.lastError;
        resolve(tab);
      });
    });
  }

  /**
   * 未ログインならログイン画面を開く
   */
  private openRakutenPage(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      chrome.tabs.update(tabId, { url: RakutenUtils.BASE_URL }, () => {
        // lastError を読むことで未処理エラーの警告を避ける
        void chrome.runtime.lastError;
        resolve();
      });
    });
  }

  /**
   * タブの読み込み完了を待つ
   */
  private waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      };

      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo
      ): void => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          finish();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
      const timer = setTimeout(finish, this.tabLoadTimeoutMs);
    });
  }

  /**
   * コンテンツスクリプトへメッセージを送る
   */
  private sendToContentScript(tabId: number, message: ChromeMessage): Promise<unknown> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(response);
      });
    });
  }

  private isAllowedOrigin(origin: string): boolean {
    return isAllowedOrigin(origin, this.allowedOrigins ?? readAllowedOrigins());
  }

  private getSenderOrigin(sender: chrome.runtime.MessageSender | undefined): string {
    if (sender?.origin) {
      return sender.origin;
    }
    if (sender?.url) {
      try {
        return new URL(sender.url).origin;
      } catch {
        return '';
      }
    }
    return '';
  }
}

/**
 * 取得対象とするダウンロードURLか
 *
 * 楽天証券のドメインと、ページ内で生成されるblob/data URLを受け付ける
 */
function isCapturableDownloadUrl(url: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return true;
  }
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    return host === 'rakuten-sec.co.jp' || host.endsWith('.rakuten-sec.co.jp');
  } catch {
    return false;
  }
}

function isLoginStateResponse(response: unknown): response is LoginStateResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof (response as LoginStateResponse).success === 'boolean'
  );
}

function isCsvContentResponse(response: unknown): response is CsvContentResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof (response as CsvContentResponse).success === 'boolean'
  );
}

function errorResponse(error: string): ExternalErrorResponse {
  return { type: 'error', error };
}
