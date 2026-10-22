/**
 * 外部ページ(shoken-webapp)からのCSV取得依頼を処理する
 *
 * 画面へ返すのはCSVの本文だけで、氏名や口座番号などの個人情報は含めない
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

/**
 * ダウンロード開始の待ち受け
 */
interface DownloadCapture {
  /** 取得対象のタブID */
  readonly tabId: number;
  /** 捕捉したダウンロード先URL（捕捉できなければ undefined） */
  readonly url: Promise<string | undefined>;
  /** 待ち受けを開始する */
  readonly arm: () => void;
  /** 待ちを中断する */
  readonly cancel: () => void;
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

  /** 取得処理の実行中フラグ（同時に複数の取得が走るとタブの操作が混ざるため） */
  private running = false;

  /** ダウンロード開始を待っている取得処理 */
  private pendingCapture?: DownloadCapture;

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

    if (this.running) {
      port.postMessage(errorResponse('別の取得が実行中のため受け付けません'));
      return;
    }

    this.running = true;
    try {
      const result = await this.fetchLatestCsv(request.kinds, (progress) => {
        port.postMessage(progress);
      });
      port.postMessage(result);
    } catch {
      port.postMessage(errorResponse('CSVの取得中に予期しないエラーが発生しました'));
    } finally {
      this.running = false;
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
    const capture = this.createDownloadCapture(tabId);
    this.pendingCapture = capture;

    let stepResult: DownloadResponse;
    try {
      stepResult = await this.downloadRunner.executeDownloadRequest({
        action: 'download-csv-request',
        payload: { selectedOptions: [kind], tabId, captureDownloadStart: true },
      });
    } finally {
      this.pendingCapture = undefined;
    }

    if (!stepResult.success) {
      capture.cancel();
      return { success: false, reason: stepResult.error ?? 'CSVの取得に失敗しました' };
    }

    // クリック直前の通知が届かなかった場合に備えて、待ちを開始する
    capture.arm();
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
   * コンテンツスクリプトがCSVダウンロードのクリック直前に知らせる
   *
   * クリックの直前まで待ち受けを開始しないことで、同時に別のダウンロードが
   * 始まっても取り違えないようにする。対象タブ以外からの通知は受け付けない
   */
  notifyDownloadWillStart(tabId: number | undefined): void {
    if (!this.pendingCapture || tabId === undefined) {
      return;
    }
    if (tabId !== this.pendingCapture.tabId) {
      return;
    }
    this.pendingCapture.arm();
  }

  /**
   * ダウンロードの開始を待ち、URLを捕捉する
   */
  private createDownloadCapture(tabId: number): DownloadCapture {
    let resolveUrl: (url: string | undefined) => void = () => {};
    const url = new Promise<string | undefined>((resolve) => {
      resolveUrl = resolve;
    });
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (value: string | undefined): void => {
      if (armed) {
        chrome.downloads.onCreated.removeListener(listener);
      }
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      resolveUrl(value);
    };

    const listener = (item: chrome.downloads.DownloadItem): void => {
      if (!isCapturableDownloadUrl(item.url)) {
        return;
      }
      finish(item.url);
    };

    return {
      tabId,
      url,
      arm: () => {
        if (armed) {
          return;
        }
        armed = true;
        chrome.downloads.onCreated.addListener(listener);
        timer = setTimeout(() => finish(undefined), this.downloadStartTimeoutMs);
      },
      cancel: () => finish(undefined),
    };
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
   *
   * コンテンツスクリプトが応答しない場合は判断できないものとして扱い、
   * ログイン画面を開いて読み込み直してから判定し直す
   */
  private async waitForLogin(
    tabId: number,
    notify: (progress: FetchLatestCsvProgress) => void
  ): Promise<boolean> {
    const deadline = Date.now() + this.loginWaitTimeoutMs;
    let loginPageOpened = false;
    let notified = false;

    while (Date.now() < deadline) {
      const loggedIn = await this.getLoginState(tabId);
      if (loggedIn === true) {
        return true;
      }

      if (loggedIn === false && !notified) {
        notify({ type: 'progress', state: 'login-wait' });
        notified = true;
      }

      if (!loginPageOpened) {
        await this.openRakutenPage(tabId);
        loginPageOpened = true;
      }

      await sleep(this.loginPollIntervalMs);
    }
    return false;
  }

  /**
   * ログイン状態の確認
   *
   * コンテンツスクリプトが応答しない場合は判定できないものとして undefined を返す
   */
  private async getLoginState(tabId: number): Promise<boolean | undefined> {
    const response = await this.sendToContentScript(tabId, { action: 'check-login-state' });
    if (!isLoginStateResponse(response)) {
      return undefined;
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
export function isCapturableDownloadUrl(url: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return true;
  }
  return isRakutenDomainUrl(url);
}

function isRakutenDomainUrl(url: string): boolean {
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
