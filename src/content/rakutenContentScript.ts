import type { CsvDownloadMessage, DownloadResponse, RakutenPageType } from '../types';
import { RakutenUtils, DomUtils } from '../utils';

/**
 * 楽天証券 CSV拡張機能のコンテンツスクリプト
 */
class RakutenCsvExtension {
  private readonly pageType: RakutenPageType;
  private readonly csvButtonSelectors: string[] = [
    '[data-testid="csv-download-button"]',
    'a[href*="csv"]',
    'button[title*="CSV"]',
    '.csv-download',
    '#csvDownload',
    'a[onclick*="csv"]',
    'button[onclick*="csv"]'
  ];

  constructor() {
    this.pageType = RakutenUtils.detectPageType(window.location.href);
    this.initialize();
  }

  /**
   * 拡張機能の初期化
   */
  private initialize(): void {
    console.log('楽天証券CSV拡張機能が初期化されました');
    console.log('検出されたページタイプ:', this.pageType);
    
    this.setupMessageListener();
    this.addCsvDownloadEnhancements();
  }

  /**
   * Chrome拡張機能のメッセージリスナーを設定
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: CsvDownloadMessage, _, sendResponse) => {
        if (message.action === 'download-csv') {
          this.handleCsvDownload(message)
            .then(response => sendResponse(response))
            .catch(error => {
              console.error('CSVダウンロードエラー:', error);
              sendResponse({
                success: false,
                error: error.message || 'ダウンロードに失敗しました'
              });
            });
          return true; // 非同期レスポンス
        }
        return false;
      }
    );
  }

  /**
   * CSVダウンロードを処理
   */
  private async handleCsvDownload(message: CsvDownloadMessage): Promise<DownloadResponse> {
    try {
      console.log('CSVダウンロード開始:', message.payload?.message);

      const csvButton = this.findCsvDownloadButton();
      if (!csvButton) {
        return {
          success: false,
          error: 'CSVダウンロードボタンが見つかりません。このページではCSVダウンロードがサポートされていない可能性があります。'
        };
      }

      if (!DomUtils.isElementVisible(csvButton)) {
        return {
          success: false,
          error: 'CSVダウンロードボタンが表示されていません。'
        };
      }

      const clickSuccess = DomUtils.safeClick(csvButton);
      if (!clickSuccess) {
        return {
          success: false,
          error: 'CSVダウンロードボタンのクリックに失敗しました。'
        };
      }

      // ダウンロード開始の確認（短時間待機）
      await this.waitForDownload();

      return {
        success: true,
        message: 'CSVダウンロードを開始しました'
      };

    } catch (error) {
      console.error('CSVダウンロード処理でエラーが発生:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
      };
    }
  }

  /**
   * CSVダウンロードボタンを検索
   */
  private findCsvDownloadButton(): Element | null {
    // 複数のセレクターで検索
    const button = DomUtils.findElement(this.csvButtonSelectors);
    if (button) return button;

    // テキスト内容で検索
    const buttons = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
    const csvButton = buttons.find(btn => {
      const text = DomUtils.getTextContent(btn).toLowerCase();
      return text.includes('csv') || text.includes('ダウンロード') || text.includes('出力');
    });

    return csvButton || null;
  }

  /**
   * ダウンロード完了を待機
   */
  private async waitForDownload(timeout: number = 3000): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, timeout);
    });
  }

  /**
   * CSV ダウンロード機能の強化
   */
  private addCsvDownloadEnhancements(): void {
    // CSVボタンが見つかった場合、視覚的に強調
    const csvButton = this.findCsvDownloadButton();
    if (csvButton && csvButton instanceof HTMLElement) {
      this.enhanceCsvButton(csvButton);
    }

    // ページタイプに応じた追加処理
    switch (this.pageType) {
      case 'dividend':
        this.enhanceDividendPage();
        break;
      case 'transaction':
        this.enhanceTransactionPage();
        break;
      case 'portfolio':
        this.enhancePortfolioPage();
        break;
      default:
        console.log('このページタイプはサポートされていません:', this.pageType);
    }
  }

  /**
   * CSVボタンの視覚的強化
   */
  private enhanceCsvButton(button: HTMLElement): void {
    button.style.cssText += `
      border: 2px solid #007bff !important;
      box-shadow: 0 0 5px rgba(0, 123, 255, 0.5) !important;
      position: relative !important;
    `;

    // ツールチップ追加
    button.title = '楽天証券CSV拡張機能でダウンロード可能';
    
    // バッジ追加
    const badge = document.createElement('span');
    badge.innerHTML = '🔧';
    badge.style.cssText = `
      position: absolute !important;
      top: -5px !important;
      right: -5px !important;
      background: #007bff !important;
      color: white !important;
      border-radius: 50% !important;
      width: 20px !important;
      height: 20px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 12px !important;
      z-index: 9999 !important;
    `;
    
    if (button.style.position !== 'relative') {
      button.style.position = 'relative';
    }
    button.appendChild(badge);
  }

  /**
   * 配当金ページの強化
   */
  private enhanceDividendPage(): void {
    console.log('配当金ページの強化を適用');
    // 配当金ページ固有の処理
  }

  /**
   * 取引履歴ページの強化
   */
  private enhanceTransactionPage(): void {
    console.log('取引履歴ページの強化を適用');
    // 取引履歴ページ固有の処理
  }

  /**
   * ポートフォリオページの強化
   */
  private enhancePortfolioPage(): void {
    console.log('ポートフォリオページの強化を適用');
    // ポートフォリオページ固有の処理
  }
}

/**
 * 楽天証券CSV拡張機能の初期化
 */
const initializeRakutenCsvExtension = (): void => {
  if (!RakutenUtils.isRakutenSecurities(window.location.href)) {
    console.log('楽天証券のサイトではありません');
    return;
  }

  new RakutenCsvExtension();
};

// ページ読み込み完了時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeRakutenCsvExtension);
} else {
  initializeRakutenCsvExtension();
}

// SPA対応: URLの変更を監視
let currentUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    console.log('URL変更を検出:', currentUrl);
    
    // 少し待ってから再初期化
    setTimeout(initializeRakutenCsvExtension, 1000);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
