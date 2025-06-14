import type { CsvDownloadInstruction, DownloadResponse } from '../types';
import { RakutenUtils, DomUtils } from '../utils';

/**
 * 楽天証券 CSV拡張機能のコンテンツスクリプト
 */
class RakutenCsvExtension {
  private static instance: RakutenCsvExtension | null = null;
  private isInitialized = false;

  constructor() {
    if (RakutenCsvExtension.instance) {
      return RakutenCsvExtension.instance;
    }
    RakutenCsvExtension.instance = this;
    this.initialize();
  }

  static getInstance(): RakutenCsvExtension {
    return new RakutenCsvExtension();
  }

  private initialize(): void {
    if (this.isInitialized) return;

    console.log('楽天証券CSV拡張機能を初期化しました');
    this.setupMessageListener();
    this.registerWithBackground();
    this.isInitialized = true;
  }

  private registerWithBackground(): void {
    chrome.runtime.sendMessage({
      action: 'register-rakuten-tab',
      url: window.location.href,
      timestamp: Date.now()
    });
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: CsvDownloadInstruction | { action: string }, _, sendResponse) => {
        switch (message.action) {
          case 'execute-csv-download':
            this.handleCsvDownloadExecution(message as CsvDownloadInstruction)
              .then(response => sendResponse(response))
              .catch(error => sendResponse({ 
                success: false, 
                error: error.message || 'ダウンロード実行に失敗しました' 
              }));
            return true;

          default:
            return false;
        }
      }
    );
  }

  private async handleCsvDownloadExecution(message: CsvDownloadInstruction): Promise<DownloadResponse> {
    const { downloadStep, selectors } = message.payload;

    console.log(`CSVダウンロードステップ実行: ${downloadStep}`);

    if (!RakutenUtils.isRakutenSecurities(window.location.href)) {
      return { success: false, error: '楽天証券のサイトではありません' };
    }

    try {
      switch (downloadStep) {
        case 'navigate-to-page':
          return await this.executeClick(selectors.menuLink, 'ページ遷移');

        case 'select-tab':
          return await this.executeClick(selectors.tabSelector, 'タブ選択');

        case 'select-period':
          return await this.executeClick(selectors.periodRadio, '期間選択');

        case 'display-data':
          return await this.executeClick(selectors.displayButton, 'データ表示');

        case 'download-csv':
          return await this.executeClick(selectors.csvButton, 'CSVダウンロード');

        default:
          return { success: false, error: `未対応のダウンロードステップです: ${downloadStep}` };
      }
    } catch (error) {
      console.error(`ステップ ${downloadStep} 実行エラー:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : `ステップ ${downloadStep} の実行に失敗しました` 
      };
    }
  }

  private async executeClick(selector: string | undefined, actionName: string): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: `${actionName}のセレクターが指定されていません` };
    }

    const element = await this.waitForElement(selector);
    
    if (DomUtils.safeClick(element)) {
      return { success: true, message: `${actionName}が完了しました` };
    } else {
      return { success: false, error: `${actionName}のクリックに失敗しました` };
    }
  }

  private waitForElement(selectorGroup: string, timeout = 3000): Promise<Element> {
    return new Promise((resolve, reject) => {
      const selectors = selectorGroup.split(',').map(s => s.trim());

      // 既存要素をチェック
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
      }

      // MutationObserverで待機
      const observer = new MutationObserver(() => {
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              observer.disconnect();
              resolve(element);
              return;
            }
          } catch (error) {
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

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素が見つかりませんでした: ${selectorGroup}`));
      }, timeout);
    });
  }
}

// 初期化
if (RakutenUtils.isRakutenSecurities(window.location.href)) {
  console.log('楽天証券CSV拡張機能を開始');
  RakutenCsvExtension.getInstance();
}
