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
  DownloadResponse,
  BackgroundMessage,
  ExtensionUpdatedMessage,
  CsvDownloadStep
} from '../types';
import { RakutenUtils } from '../utils';
import { DownloadStepExecutor, type ExtensionConfig, type StepGroup } from './downloadStepExecutor';

/**
 * 拡張機能の主要クラス
 */
class RakutenCsvBackgroundService {
  private static instance: RakutenCsvBackgroundService | null = null;

  private readonly rakutenTabs = new Set<number>();
  private activeTabId: number | undefined;
  private lastActiveTime = Date.now();

  private readonly downloadStepExecutor = new DownloadStepExecutor({
    hasRakutenTab: (tabId) => this.rakutenTabs.has(tabId),
    getActiveTabId: () => this.activeTabId
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
    this.log('楽天証券CSV拡張機能のバックグラウンドサービスが初期化されました');
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

    // アイコンクリック時
    chrome.action.onClicked.addListener((tab) => {
      this.handleActionClick(tab);
    });

    // メッセージ処理
    chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // 非同期レスポンス
    });
  }

  /**
   * インストール処理
   */
  private handleInstallation(details: chrome.runtime.InstalledDetails): void {
    this.log('拡張機能がインストールされました:', details);

    if (details.reason === 'install') {
      this.log('初回インストール');
    } else if (details.reason === 'update') {
      this.log('拡張機能が更新されました');
      this.notifyUpdate();
    }
  }

  /**
   * 起動処理
   */
  private handleStartup(): void {
    this.log('拡張機能が起動しました');
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
        this.log(`楽天証券サイトが読み込まれました: ${tabId}`);
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
    this.log(`タブが削除されました: ${tabId}`);
  }

  /**
   * タブアクティブ化処理
   */
  private handleTabActivation(activeInfo: chrome.tabs.OnActivatedInfo): void {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (!chrome.runtime.lastError && tab.url && this.isRakutenSecurities(tab.url)) {
        this.setActiveTab(activeInfo.tabId);
        this.log(`楽天証券タブがアクティブになりました: ${activeInfo.tabId}`);
      }
    });
  }

  /**
   * アクションクリック処理
   */
  private handleActionClick(tab: chrome.tabs.Tab): void {
    this.log('拡張機能アイコンがクリックされました:', tab);

    if (tab.url && this.isRakutenSecurities(tab.url) && tab.id) {
      this.setActiveTab(tab.id);
    }
  }

  /**
   * メッセージ処理
   */
  private async handleMessage(
    message: BackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): Promise<void> {
    this.log('メッセージを受信:', message);

    try {
      let response: unknown;

      switch (message.action) {
        case 'page-ready':
          response = this.handlePageReady(sender);
          break;

        case 'download-csv-request':
          response = await this.handleCsvDownloadRequest(message);
          break;

        case 'get-extension-state':
          response = this.handleGetExtensionState();
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
      this.log(`ページ準備完了通知を受信: ${sender.tab.id}`);
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
   * 拡張機能状態取得処理
   */
  private handleGetExtensionState(): { success: boolean; state: ExtensionState } {
    return {
      success: true,
      state: this.getState()
    };
  }

  /**
   * 既存の楽天証券タブを検索
   */
  private findExistingRakutenTabs(): void {
    chrome.tabs.query({ url: '*://*.rakuten-sec.co.jp/*' }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          this.addRakutenTab(tab.id);
          this.log(`既存の楽天証券タブを発見: ${tab.id}`);
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
          this.log('タブへの更新通知に失敗:', chrome.runtime.lastError.message);
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
   * ステップ列を実行単位でグルーピング（DownloadStepExecutor への委譲）
   *
   * テストおよびデバッグ用に公開している（getState/getConfig と同様）。
   */
  groupSteps(steps: readonly CsvDownloadStep[]): readonly StepGroup[] {
    return this.downloadStepExecutor.groupSteps(steps);
  }

  /**
   * ログ出力
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.downloadStepExecutor.getConfig().debugMode) {
      console.log(`[RakutenCSV] ${message}`, ...args);
    }
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
      activeTabId: this.activeTabId,
      lastActiveTime: this.lastActiveTime
    };
  }

  private addRakutenTab(tabId: number): void {
    this.rakutenTabs.add(tabId);
    this.lastActiveTime = Date.now();
  }

  private removeRakutenTab(tabId: number): void {
    this.rakutenTabs.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = undefined;
    }
    this.lastActiveTime = Date.now();
  }

  private setActiveTab(tabId: number): void {
    this.activeTabId = tabId;
    this.lastActiveTime = Date.now();
  }

  /**
   * 設定を取得（デバッグ用）
   */
  getConfig(): ExtensionConfig {
    return this.downloadStepExecutor.getConfig();
  }
}

// サービスのインスタンス化
const backgroundService = RakutenCsvBackgroundService.getInstance();

// グローバルなログ出力
console.log('楽天証券CSV拡張機能のバックグラウンドサービスが読み込まれました');

// デバッグ用のグローバル関数
(globalThis as { rakutenCsvService?: RakutenCsvBackgroundService }).rakutenCsvService = backgroundService;
