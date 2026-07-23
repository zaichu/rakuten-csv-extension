import type { 
  CsvDownloadInstruction, 
  DownloadResponse, 
  TabRegistrationMessage,
  PageReadyMessage,
  ChromeMessage,
  CsvDownloadStep,
  CsvSelectors
} from '../types';
import { RakutenUtils, DomUtils } from '../utils';

/**
 * 楽天証券 CSV拡張機能のコンテンツスクリプト
 * シングルトンパターンで実装し、メッセージリスナーを管理
 */
class RakutenCsvExtension {
  private static instance: RakutenCsvExtension | null = null;
  private isInitialized = false;
  private readonly retryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    elementTimeout: 5000
  };

  private constructor() {
    this.initialize();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): RakutenCsvExtension {
    if (!RakutenCsvExtension.instance) {
      RakutenCsvExtension.instance = new RakutenCsvExtension();
    }
    return RakutenCsvExtension.instance;
  }

  /**
   * 拡張機能の初期化
   */
  private initialize(): void {
    if (this.isInitialized) return;

    console.log('楽天証券CSV拡張機能を初期化中...');
    
    try {
      this.setupMessageListener();
      this.registerWithBackground();
      this.notifyPageReady();
      this.isInitialized = true;
      console.log('楽天証券CSV拡張機能の初期化が完了しました');
    } catch (error) {
      console.error('楽天証券CSV拡張機能の初期化に失敗:', error);
    }
  }

  /**
   * バックグラウンドサービスに登録
   */
  private registerWithBackground(): void {
    try {
      const registrationMessage: TabRegistrationMessage = {
        action: 'register-rakuten-tab',
        url: window.location.href,
        timestamp: Date.now()
      };

      chrome.runtime.sendMessage(registrationMessage, (response) => {
        if (chrome.runtime.lastError) {
          console.error('バックグラウンドサービスへの登録に失敗:', chrome.runtime.lastError.message);
        } else {
          console.log('バックグラウンドサービスに正常に登録されました:', response);
        }
      });
    } catch (error) {
      console.error('バックグラウンドサービスへの登録でエラー:', error);
    }
  }

  /**
   * メッセージリスナーを設定
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: ChromeMessage, _sender, sendResponse) => {
        console.log('コンテンツスクリプトでメッセージを受信:', message);

        // 非同期処理を適切に処理
        this.handleMessage(message)
          .then(response => {
            sendResponse(response);
          })
          .catch(error => {
            console.error('メッセージ処理でエラーが発生:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'メッセージ処理に失敗しました'
            });
          });

        // 非同期レスポンスを有効にする
        return true;
      }
    );
  }

  /**
   * メッセージを処理
   */
  private async handleMessage(message: ChromeMessage): Promise<DownloadResponse> {
    switch (message.action) {
      case 'execute-csv-download':
        return this.handleCsvDownloadExecution(message as CsvDownloadInstruction);

      case 'extension-updated':
        this.handleExtensionUpdate();
        return { success: true, message: '拡張機能が更新されました' };

      case 'ping':
        return { success: true, message: 'pong' };

      default:
        return { 
          success: false, 
          error: `未対応のアクション: ${message.action}` 
        };
    }
  }

  /**
   * 拡張機能更新の処理
   */
  private handleExtensionUpdate(): void {
    console.log('拡張機能が更新されました。再初期化します。');
    this.isInitialized = false;
    this.initialize();
  }

  /**
   * CSVダウンロード実行を処理
   */
  private async handleCsvDownloadExecution(
    message: CsvDownloadInstruction
  ): Promise<DownloadResponse> {
    const { downloadStep, selectors, retryCount = 0 } = message.payload;

    console.log(`CSVダウンロードステップ実行: ${downloadStep} (試行回数: ${retryCount + 1})`);

    // 楽天証券サイトの確認
    if (!RakutenUtils.isRakutenSecurities(window.location.href)) {
      return { 
        success: false, 
        error: '楽天証券のサイトではありません',
        step: downloadStep
      };
    }

    try {
      const result = await this.executeDownloadStep(downloadStep, selectors);
      console.log(`ステップ ${downloadStep} 完了:`, result);
      return result;
    } catch (error) {
      console.error(`ステップ ${downloadStep} 実行エラー:`, error);
      
      // リトライ可能なエラーかチェック
      if (retryCount < this.retryConfig.maxRetries && this.isRetryableError(error)) {
        console.log(`ステップ ${downloadStep} のリトライが可能です`);
        return {
          success: false,
          error: `ステップ ${downloadStep} の実行に失敗しました (リトライ ${retryCount + 1}/${this.retryConfig.maxRetries})`,
          step: downloadStep
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : `ステップ ${downloadStep} の実行に失敗しました`,
        step: downloadStep
      };
    }
  }

  /**
   * ダウンロードステップを実行
   */
  private async executeDownloadStep(
    step: CsvDownloadStep, 
    selectors: CsvSelectors
  ): Promise<DownloadResponse> {
    switch (step) {
      case 'navigate-to-page':
        return this.executeNavigateToPage(selectors.menuLink);

      case 'select-tab':
        return this.executeSelectTab(selectors.tabSelector);

      case 'select-period':
        return this.executeSelectPeriod(selectors.periodRadio);

      case 'display-data':
        return this.executeDisplayData(selectors.displayButton);

      case 'download-csv':
        return this.executeDownloadCsv(selectors.csvButton);

      default:
        return { 
          success: false, 
          error: `未対応のダウンロードステップです: ${step}`,
          step
        };
    }
  }

  /**
   * ページ遷移を実行
   */
  private async executeNavigateToPage(selector?: string): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: 'ページ遷移のセレクターが指定されていません' };
    }

    const element = await this.findElementWithRetry(selector);
    return this.clickElementSafely(element, 'ページ遷移');
  }

  /**
   * タブ選択を実行
   */
  private async executeSelectTab(selector?: string): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: 'タブ選択のセレクターが指定されていません' };
    }

    const element = await this.findElementWithRetry(selector);
    return this.clickElementSafely(element, 'タブ選択');
  }

  /**
   * 期間選択を実行
   */
  private async executeSelectPeriod(selector?: string): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: '期間選択のセレクターが指定されていません' };
    }

    const element = await this.findElementWithRetry(selector);
    return this.clickElementSafely(element, '期間選択');
  }

  /**
   * データ表示を実行
   */
  private async executeDisplayData(selector?: string): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: 'データ表示のセレクターが指定されていません' };
    }

    const element = await this.findElementWithRetry(selector);
    return this.clickElementSafely(element, 'データ表示');
  }

  /**
   * CSVダウンロードを実行
   */
  private async executeDownloadCsv(selector?: string): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: 'CSVダウンロードのセレクターが指定されていません' };
    }

    const element = await this.findElementWithRetry(selector);
    return this.clickElementSafely(element, 'CSVダウンロード');
  }

  /**
   * 要素をリトライ付きで検索
   */
  private async findElementWithRetry(
    selectorGroup: string, 
    timeout: number = this.retryConfig.elementTimeout
  ): Promise<Element> {
    const selectors = selectorGroup.split(',').map(s => s.trim());

    // 既存要素をチェック
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`既存要素が見つかりました: ${selector}`);
        return element;
      }
    }

    // MutationObserverで要素の出現を待機
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              observer.disconnect();
              clearTimeout(timeoutId);
              console.log(`動的に要素が見つかりました: ${selector}`);
              resolve(element);
              return;
            }
          } catch (error) {
            console.warn(`セレクター実行エラー: ${selector}`, error);
            continue;
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });

      const timeoutId = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素が見つかりませんでした: ${selectorGroup} (${timeout}ms)`));
      }, timeout);
    });
  }

  /**
   * 要素を安全にクリック
   */
  private clickElementSafely(element: Element | null, actionName: string): DownloadResponse {
    if (!element) {
      return { 
        success: false, 
        error: `${actionName}の要素が見つかりません` 
      };
    }

    console.log(`${actionName}を実行中...`, element);

    if (DomUtils.safeClick(element)) {
      return { 
        success: true, 
        message: `${actionName}が完了しました` 
      };
    } else {
      return { 
        success: false, 
        error: `${actionName}のクリックに失敗しました` 
      };
    }
  }

  /**
   * ページ準備完了をバックグラウンドに通知
   */
  private notifyPageReady(): void {
    try {
      const pageReadyMessage: PageReadyMessage = {
        action: 'page-ready',
        url: window.location.href
      };

      chrome.runtime.sendMessage(pageReadyMessage, (response) => {
        if (!chrome.runtime.lastError) {
          console.log('ページ準備完了を通知しました:', response);
        }
      });
    } catch (error) {
      console.warn('ページ準備完了通知でエラー:', error);
    }
  }

  /**
   * リトライ可能なエラーかどうかを判定
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const retryableMessages = [
      '要素が見つかりませんでした',
      'クリックに失敗しました',
      'タイムアウト',
      'network error',
      'connection failed'
    ];

    return retryableMessages.some(message => 
      error.message.toLowerCase().includes(message.toLowerCase())
    );
  }
}

/**
 * ページ読み込み完了時の処理
 */
function initializeExtension(): void {
  console.log('楽天証券CSV拡張機能の初期化を開始します');
  
  if (RakutenUtils.isRakutenSecurities(window.location.href)) {
    RakutenCsvExtension.getInstance();
  } else {
    console.log('楽天証券のサイトではないため、拡張機能を初期化しません');
  }
}

// DOM読み込み完了時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// CRXjsビルド用のエクスポート関数
export function onExecute(): void {
  if (RakutenUtils.isRakutenSecurities(window.location.href)) {
    console.log('楽天証券CSV拡張機能をonExecuteで開始');
    RakutenCsvExtension.getInstance();
  }
}

// スクリプト読み込み完了のログ
console.log('楽天証券CSV拡張機能のコンテンツスクリプトが読み込まれました');
