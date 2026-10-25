/**
 * 外部ページ(shoken-webapp)からのCSV取得依頼を処理する
 *
 * 画面へ返すのはCSVの本文だけで、氏名や口座番号などの個人情報は含めない
 */

import type {
  ChromeMessage,
  CsvDownloadMessage,
  CsvDownloadType,
  DownloadResponse,
  ExternalErrorResponse,
  FetchLatestCsvFailure,
  FetchLatestCsvProgress,
  FetchLatestCsvRequest,
  FetchLatestCsvResult,
  FetchLatestCsvTiming,
  FetchedCsv,
  LoginStateResponse,
} from '../types';
import { CSV_DOWNLOAD_CONFIGS } from '../config/csvDownloadConfigs';
import { RakutenUtils, sleep } from '../utils';
import {
  createDownloadCapture,
  createDownloadedFileReader,
  readDownloadedCsv,
  waitForCompletedDownload,
  type DownloadCapture,
  type DownloadedFileReader,
} from './downloadedFile';

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
  /** ダウンロードの完了を待つ最大時間(ms) */
  readonly downloadCompleteTimeoutMs?: number;
  /** タブの読み込み完了を待つ最大時間(ms) */
  readonly tabLoadTimeoutMs?: number;
  /** ダウンロードされたファイルの読み取り */
  readonly fileReader?: DownloadedFileReader;
}

const DEFAULT_LOGIN_WAIT_TIMEOUT_MS = 180_000;
const DEFAULT_LOGIN_POLL_INTERVAL_MS = 2_000;
const DEFAULT_DOWNLOAD_START_TIMEOUT_MS = 10_000;
const DEFAULT_DOWNLOAD_COMPLETE_TIMEOUT_MS = 60_000;
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
  private readonly downloadCompleteTimeoutMs: number;
  private readonly tabLoadTimeoutMs: number;
  private readonly fileReader: DownloadedFileReader;

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
    this.downloadCompleteTimeoutMs = config.downloadCompleteTimeoutMs ?? DEFAULT_DOWNLOAD_COMPLETE_TIMEOUT_MS;
    this.tabLoadTimeoutMs = config.tabLoadTimeoutMs ?? DEFAULT_TAB_LOAD_TIMEOUT_MS;
    this.fileReader = config.fileReader ?? createDownloadedFileReader();
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
    let createdTabId: number | undefined;
    try {
      const result = await this.fetchLatestCsv(request.kinds, (progress) => {
        port.postMessage(progress);
      }, (tabId) => {
        createdTabId = tabId;
      });
      port.postMessage(result);
    } catch {
      port.postMessage(errorResponse('CSVの取得中に予期しないエラーが発生しました'));
    } finally {
      try {
        if (createdTabId !== undefined) {
          await chrome.tabs.remove(createdTabId).catch(() => undefined);
        }
        if (port.sender?.tab?.id !== undefined) {
          await this.focusTab(port.sender.tab).catch(() => undefined);
        }
      } finally {
        this.running = false;
      }
    }
  }

  /**
   * 種類ごとの取得
   */
  private async fetchLatestCsv(
    kinds: readonly CsvDownloadType[],
    notify: (progress: FetchLatestCsvProgress) => void,
    onTabCreated: (tabId: number) => void
  ): Promise<FetchLatestCsvResult> {
    const csvs: FetchedCsv[] = [];
    const failures: FetchLatestCsvFailure[] = [];
    const timings: FetchLatestCsvTiming[] = [];

    const totalStart = Date.now();
    let stageStart = totalStart;

    const recordTiming = (stage: string) => {
      const now = Date.now();
      timings.push({ stage, durationMs: now - stageStart });
      stageStart = now;
    };

    const tabId = await this.ensureRakutenTab(onTabCreated);
    recordTiming('tab-preparation');
    if (tabId === undefined) {
      recordTiming('total');
      return {
        type: 'result',
        csvs,
        failures: kinds.map((kind) => ({ kind, reason: '楽天証券のタブを開けませんでした' })),
        timings,
      };
    }

    const loggedIn = await this.waitForLogin(tabId, notify);
    recordTiming('login-wait');
    if (!loggedIn) {
      recordTiming('total');
      return {
        type: 'result',
        csvs,
        failures: kinds.map((kind) => ({ kind, reason: 'ログインが完了しませんでした' })),
        timings,
      };
    }

    for (const kind of kinds) {
      notify({ type: 'progress', state: 'fetching', kind });
      const kindStart = Date.now();

      const outcome = await this.fetchKind(tabId, kind);
      const kindDuration = Date.now() - kindStart;
      timings.push({ stage: `fetch-${kind}`, durationMs: kindDuration });

      if (outcome.success) {
        csvs.push(outcome.csv);
        notify({ type: 'progress', state: 'completed', kind });
      } else {
        failures.push({ kind, reason: outcome.reason, code: outcome.code });
        notify({ type: 'progress', state: 'failed', kind, reason: outcome.reason });
      }
    }

    recordTiming('total');
    return { type: 'result', csvs, failures, timings };
  }

  /**
   * 1種類のCSVを取得する
   */
  private async fetchKind(
    tabId: number,
    kind: CsvDownloadType
  ): Promise<
    { success: true; csv: FetchedCsv } | { success: false; reason: string; code?: string }
  > {
    const capture = createDownloadCapture(tabId, this.downloadStartTimeoutMs);
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
    const downloadId = await capture.downloadId;
    if (downloadId === undefined) {
      return { success: false, reason: 'CSVのダウンロードを開始できませんでした' };
    }

    const item = await waitForCompletedDownload(downloadId, this.downloadCompleteTimeoutMs);
    if (!item) {
      return { success: false, reason: 'CSVのダウンロードが完了しませんでした' };
    }

    const result = await readDownloadedCsv(this.fileReader, item);
    if (!result.success) {
      return { success: false, reason: result.reason, code: result.code };
    }

    return {
      success: true,
      csv: {
        kind,
        content: result.content,
        fetchedAt: new Date().toISOString(),
        fileRemoved: result.fileRemoved,
      },
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
  private async ensureRakutenTab(onTabCreated: (tabId: number) => void): Promise<number | undefined> {
    const existing = await this.findRakutenTab();
    if (existing?.id !== undefined) {
      await this.focusTab(existing);
      return existing.id;
    }

    const tab = await this.createRakutenTab();
    if (tab?.id === undefined) {
      return undefined;
    }

    onTabCreated(tab.id);
    await this.waitForTabLoad(tab.id);
    return tab.id;
  }

  private async findRakutenTab(): Promise<chrome.tabs.Tab | undefined> {
    const tabs = await chrome.tabs.query({ url: '*://*.rakuten-sec.co.jp/*' });
    const tab = tabs.find((candidate) => candidate.active) ?? tabs[0];
    return tab;
  }

  private async focusTab(tab: chrome.tabs.Tab): Promise<void> {
    try {
      if (tab.id !== undefined) {
        await chrome.tabs.update(tab.id, { active: true });
      }
    } finally {
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    }
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

function isLoginStateResponse(response: unknown): response is LoginStateResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    typeof (response as LoginStateResponse).success === 'boolean'
  );
}

function errorResponse(error: string): ExternalErrorResponse {
  return { type: 'error', error };
}
