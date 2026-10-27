/**
 * 楽天証券CSV拡張機能のバックグラウンドサービス
 *
 * chrome イベントリスナーの配線、メッセージルーティング、
 * 楽天証券タブの状態保持を担う。ダウンロードステップの実行
 * （待機処理含む）は DownloadStepExecutor に委譲する。
 */

import type {
  ExtensionState,
  CsvDownloadMessage,
  CsvDownloadClickedMessage,
  DownloadResponse,
  BackgroundMessage,
  ExtensionUpdatedMessage
} from '../types';
import { RakutenUtils } from '../utils';
import { DownloadStepExecutor } from './downloadStepExecutor';
import { ExternalRequestHandler } from './externalRequestHandler';

/**
 * 拡張機能の主要クラス
 */
class RakutenCsvBackgroundService {
  private static instance: RakutenCsvBackgroundService | null = null;

  private readonly rakutenTabs = new Set<number>();
  private activeTabId: number | undefined;

  private readonly downloadStepExecutor = new DownloadStepExecutor({
    hasRakutenTab: (tabId) => this.rakutenTabs.has(tabId),
    getActiveTabId: () => this.activeTabId
  });

  private readonly externalRequestHandler = new ExternalRequestHandler({
    downloadRunner: this.downloadStepExecutor
  });

  private constructor() {
    this.initialize();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): RakutenCsvBackgroundService {
    if (!RakutenCsvBackgroundService.instance) {
      RakutenCsvBackgroundService.instance = new RakutenCsvBackgroundService();
    }
    return RakutenCsvBackgroundService.instance;
  }

  /**
   * サービスの初期化
   */
  private initialize(): void {
    this.setupEventListeners();
    this.findExistingRakutenTabs();
  }

  /**
   * イベントリスナーを設定
   */
  private setupEventListeners(): void {
    // 拡張機能インストール時
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // 拡張機能起動時
    chrome.runtime.onStartup.addListener(() => {
      this.handleStartup();
    });

    // タブ更新時
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    // タブ削除時
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabRemoval(tabId);
    });

    // タブアクティブ化時
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabActivation(activeInfo);
    });

    // メッセージ処理
    chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 非同期レスポンス
    });

    // 外部ページ(shoken-webapp)からの接続
    chrome.runtime.onConnectExternal.addListener((port) => {
      this.externalRequestHandler.handleConnection(port);
    });
  }

  /**
   * インストール処理
   */
  private handleInstallation(details: chrome.runtime.InstalledDetails): void {
    if (details.reason === 'update') {
      this.notifyUpdate();
    }
  }

  /**
   * 起動処理
   */
  private handleStartup(): void {
    this.findExistingRakutenTabs();
  }

  /**
   * タブ更新処理
   */
  private handleTabUpdate(
    tabId: number,
    changeInfo: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab
  ): void {
    if (changeInfo.status === 'complete' && tab.url) {
      if (this.isRakutenSecurities(tab.url)) {
        this.addRakutenTab(tabId);
      } else {
        this.removeRakutenTab(tabId);
      }
    }
  }

  /**
   * タブ削除処理
   */
  private handleTabRemoval(tabId: number): void {
    this.removeRakutenTab(tabId);
  }

  /**
   * タブアクティブ化処理
   */
  private handleTabActivation(activeInfo: chrome.tabs.OnActivatedInfo): void {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (!chrome.runtime.lastError && tab.url && this.isRakutenSecurities(tab.url)) {
        this.setActiveTab(activeInfo.tabId);
      }
    });
  }

  /**
   * メッセージ処理
   */
  private async handleMessage(
    message: BackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): Promise<void> {
    try {
      let response: unknown;

      switch (message.action) {
        case 'page-ready':
          response = this.handlePageReady(sender);
          break;

        case 'download-csv-request':
          response = await this.handleCsvDownloadRequest(message);
          break;

        case 'csv-download-will-start':
          this.externalRequestHandler.notifyDownloadWillStart(sender.tab?.id);
          response = { success: true };
          break;

        case 'csv-download-clicked':
          this.downloadStepExecutor.notifyDownloadClicked(
            sender.tab?.id,
            (message as CsvDownloadClickedMessage).clickDurationMs
          );
          response = { success: true };
          break;

        default:
          response = { success: false, error: '未対応のアクション' };
      }

      sendResponse(response);
    } catch (error) {
      this.logError('メッセージ処理エラー:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
      });
    }
  }

  /**
   * ページ準備完了処理（楽天証券タブの登録を兼ねる）
   */
  private handlePageReady(sender: chrome.runtime.MessageSender): { success: boolean } {
    if (sender.tab?.id) {
      this.addRakutenTab(sender.tab.id);
      this.setActiveTab(sender.tab.id);
      this.downloadStepExecutor.resolvePageReadyWaiters(sender.tab.id);
    }
    return { success: true };
  }

  /**
   * CSVダウンロードリクエスト処理
   */
  private handleCsvDownloadRequest(message: CsvDownloadMessage): Promise<DownloadResponse> {
    return this.downloadStepExecutor.executeDownloadRequest(message);
  }

  /**
   * 既存の楽天証券タブを検索
   */
  private findExistingRakutenTabs(): void {
    chrome.tabs.query({ url: '*://*.rakuten-sec.co.jp/*' }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          this.addRakutenTab(tab.id);
        }
      });
    });
  }

  /**
   * 更新通知
   */
  private notifyUpdate(): void {
    const message: ExtensionUpdatedMessage = { action: 'extension-updated' };
    this.getState().rakutenTabs.forEach(tabId => {
      chrome.tabs.sendMessage(tabId, message, () => {
        if (chrome.runtime.lastError) {
          this.removeRakutenTab(tabId);
        }
      });
    });
  }

  /**
   * 楽天証券サイトかどうか判定
   */
  private isRakutenSecurities(url: string): boolean {
    return RakutenUtils.isRakutenSecurities(url);
  }

  /**
   * エラーログ出力
   */
  private logError(message: string, error: unknown): void {
    console.error(`[RakutenCSV Error] ${message}`, error);
  }

  /**
   * 拡張機能の状態を取得（デバッグ用）
   */
  getState(): ExtensionState {
    return {
      rakutenTabs: new Set(this.rakutenTabs),
      activeTabId: this.activeTabId
    };
  }

  private addRakutenTab(tabId: number): void {
    this.rakutenTabs.add(tabId);
  }

  private removeRakutenTab(tabId: number): void {
    this.rakutenTabs.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = undefined;
    }
  }

  private setActiveTab(tabId: number): void {
    this.activeTabId = tabId;
  }

  /**
   * 外部リクエストハンドラを取得（テスト・デバッグ用）
   */
  getExternalRequestHandler(): ExternalRequestHandler {
    return this.externalRequestHandler;
  }
}

// サービスのインスタンス化
const backgroundService = RakutenCsvBackgroundService.getInstance();

// グローバルなログ出力
console.log('楽天証券CSV拡張機能のバックグラウンドサービスが読み込まれました');

// デバッグ用のグローバル関数
(globalThis as { rakutenCsvService?: RakutenCsvBackgroundService }).rakutenCsvService = backgroundService;
