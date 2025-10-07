/**
 * 楽天証券CSV拡張機能のバックグラウンドサービス（リファクタ版）
 * 
 * 改善点：
 * - より良いエラーハンドリング
 * - 型安全性の向上
 * - モジュラーな設計
 * - 設定の分離
 * - 状態管理の改善
 */

import type {
  ExtensionState,
  CsvDownloadMessage,
  DownloadResponse,
  ChromeMessage,
  CsvDownloadConfig,
  CsvDownloadType,
  CsvDownloadStep
} from '../types';
import { RakutenUtils } from '../utils';

/**
 * 拡張機能の設定
 */
interface ExtensionConfig {
  readonly maxRetries: number;
  readonly stepTimeout: number;
  readonly retryInterval: number;
  readonly debugMode: boolean;
}

/**
 * 待機時間の設定
 */
interface WaitTimeConfig {
  readonly 'navigate-to-page': number;
  readonly 'select-tab': number;
  readonly 'select-period': number;
  readonly 'display-data': number;
  readonly 'download-csv': number;
}

/**
 * 拡張機能の主要クラス
 */
class RakutenCsvBackgroundService {
  private static instance: RakutenCsvBackgroundService | null = null;

  private readonly config: ExtensionConfig = {
    maxRetries: 2,
    stepTimeout: 30000,
    retryInterval: 1000,
    debugMode: false
  };

  private readonly waitTimes: WaitTimeConfig = {
    'navigate-to-page': 500,
    'select-tab': 500,
    'select-period': 500,
    'display-data': 500,
    'download-csv': 500
  };

  private state: ExtensionState = {
    rakutenTabs: new Set<number>(),
    lastActiveTime: Date.now()
  };

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
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): Promise<void> {
    this.log('メッセージを受信:', message);

    try {
      let response: unknown;

      switch (message.action) {
        case 'register-rakuten-tab':
          response = this.handleTabRegistration(sender);
          break;

        case 'page-ready':
          response = this.handlePageReady(sender);
          break;

        case 'download-csv-request':
          response = await this.handleCsvDownloadRequest(message as CsvDownloadMessage);
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
   * タブ登録処理
   */
  private handleTabRegistration(sender: chrome.runtime.MessageSender): { success: boolean } {
    if (sender.tab?.id) {
      this.addRakutenTab(sender.tab.id);
      this.setActiveTab(sender.tab.id);
      this.log(`楽天証券タブが登録されました: ${sender.tab.id}`);
    }
    return { success: true };
  }

  /**
   * ページ準備完了処理
   */
  private handlePageReady(sender: chrome.runtime.MessageSender): { success: boolean } {
    if (sender.tab?.id) {
      this.addRakutenTab(sender.tab.id);
      this.setActiveTab(sender.tab.id);
      this.log(`ページ準備完了通知を受信: ${sender.tab.id}`);
    }
    return { success: true };
  }

  /**
   * CSVダウンロードリクエスト処理
   */
  private async handleCsvDownloadRequest(message: CsvDownloadMessage): Promise<DownloadResponse> {
    const { selectedOptions, tabId } = message.payload;

    this.log('CSVダウンロードリクエストを受信:', { selectedOptions, tabId });

    try {
      // タブIDの決定
      const targetTabId = await this.determineTargetTab(tabId);

      // 楽天証券タブの確認
      if (!this.state.rakutenTabs.has(targetTabId)) {
        throw new Error('楽天証券のタブではありません');
      }

      // ダウンロード処理を順次実行
      for (const downloadType of selectedOptions) {
        const result = await this.processCsvDownload(targetTabId, downloadType);

        if (!result.success) {
          return result;
        }
      }

      return {
        success: true,
        message: 'すべてのCSVダウンロードが完了しました'
      };

    } catch (error) {
      this.logError('CSVダウンロードリクエスト処理エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
      };
    }
  }

  /**
   * 拡張機能状態取得処理
   */
  private handleGetExtensionState(): { success: boolean; state: ExtensionState } {
    return {
      success: true,
      state: {
        activeTabId: this.state.activeTabId,
        rakutenTabs: this.state.rakutenTabs,
        lastActiveTime: this.state.lastActiveTime
      }
    };
  }

  /**
   * CSVダウンロード処理
   */
  private async processCsvDownload(
    tabId: number,
    downloadType: CsvDownloadType
  ): Promise<DownloadResponse> {
    const config = RakutenUtils.getCsvDownloadConfig(downloadType);

    if (!config) {
      return {
        success: false,
        error: `未対応のダウンロードタイプです: ${downloadType}`
      };
    }

    this.log('ダウンロード設定:', config);

    return this.executeDownloadSequence(tabId, config);
  }

  /**
   * ダウンロードシーケンスの実行
   */
  private async executeDownloadSequence(
    tabId: number,
    config: CsvDownloadConfig
  ): Promise<DownloadResponse> {
    const { steps, selectors, description } = config;

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];

      this.log(`ステップ ${stepIndex + 1}/${steps.length}: ${step} を実行中...`);

      const result = await this.executeStepWithRetry(tabId, step, selectors);

      if (!result.success) {
        return {
          success: false,
          error: `${description}の${step}ステップで失敗: ${result.error}`
        };
      }

      // 次のステップまで待機
      const waitTime = this.waitTimes[step] || 1000;
      await this.sleep(waitTime);
    }

    return {
      success: true,
      message: `${description}のCSVダウンロードが完了しました`
    };
  }

  /**
   * ステップをリトライ付きで実行
   */
  private async executeStepWithRetry(
    tabId: number,
    step: CsvDownloadStep,
    selectors: CsvDownloadConfig['selectors']
  ): Promise<DownloadResponse> {
    let lastError: string = '';

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeStep(tabId, step, selectors);

        if (result.success) {
          return result;
        }

        lastError = result.error || 'ステップの実行に失敗しました';

        if (attempt < this.config.maxRetries) {
          this.log(`ステップ ${step} をリトライします (${attempt + 1}/${this.config.maxRetries})`);
          await this.sleep(this.config.retryInterval);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'ステップ実行中にエラーが発生しました';

        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryInterval);
        }
      }
    }

    return {
      success: false,
      error: `ステップ ${step} の実行に失敗しました（${this.config.maxRetries + 1}回試行）: ${lastError}`
    };
  }

  /**
   * 単一ステップの実行
   */
  private executeStep(
    tabId: number,
    step: CsvDownloadStep,
    selectors: CsvDownloadConfig['selectors']
  ): Promise<DownloadResponse> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, {
        action: 'execute-csv-download',
        payload: {
          downloadStep: step,
          selectors: selectors
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: `コンテンツスクリプトとの通信に失敗: ${chrome.runtime.lastError.message}`
          });
        } else {
          resolve(response || { success: false, error: 'レスポンスがありません' });
        }
      });
    });
  }

  /**
   * ターゲットタブIDを決定
   */
  private async determineTargetTab(tabId?: number): Promise<number> {
    if (tabId) {
      return tabId;
    }

    if (this.state.activeTabId) {
      return this.state.activeTabId;
    }

    // アクティブタブを取得
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id) {
      throw new Error('ターゲットタブが見つかりません');
    }

    return activeTab.id;
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
    this.state.rakutenTabs.forEach(tabId => {
      chrome.tabs.sendMessage(tabId, { action: 'extension-updated' }, () => {
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
   * 楽天証券タブを追加
   */
  private addRakutenTab(tabId: number): void {
    this.state = {
      ...this.state,
      rakutenTabs: new Set([...this.state.rakutenTabs, tabId]),
      lastActiveTime: Date.now()
    };
  }

  /**
   * 楽天証券タブを削除
   */
  private removeRakutenTab(tabId: number): void {
    const newRakutenTabs = new Set(this.state.rakutenTabs);
    newRakutenTabs.delete(tabId);

    this.state = {
      ...this.state,
      rakutenTabs: newRakutenTabs,
      activeTabId: this.state.activeTabId === tabId ? undefined : this.state.activeTabId,
      lastActiveTime: Date.now()
    };
  }

  /**
   * アクティブタブを設定
   */
  private setActiveTab(tabId: number): void {
    this.state = {
      ...this.state,
      activeTabId: tabId,
      lastActiveTime: Date.now()
    };
  }

  /**
   * 待機
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ログ出力
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.config.debugMode) {
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
    return { ...this.state };
  }

  /**
   * 設定を取得（デバッグ用）
   */
  getConfig(): ExtensionConfig {
    return { ...this.config };
  }
}

// サービスのインスタンス化
const backgroundService = RakutenCsvBackgroundService.getInstance();

// グローバルなログ出力
console.log('楽天証券CSV拡張機能のバックグラウンドサービスが読み込まれました');

// デバッグ用のグローバル関数
(globalThis as { rakutenCsvService?: RakutenCsvBackgroundService }).rakutenCsvService = backgroundService;
