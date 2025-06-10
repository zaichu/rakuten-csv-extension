import { RakutenUtils } from '../utils';

/**
 * 楽天証券CSV拡張機能のバックグラウンドスクリプト
 */
class RakutenCsvBackgroundService {
  constructor() {
    this.initialize();
  }

  /**
   * バックグラウンドサービスの初期化
   */
  private initialize(): void {
    console.log('楽天証券CSV拡張機能のバックグラウンドサービスが開始されました');
    
    this.setupContextMenus();
    this.setupActionHandler();
    this.setupTabUpdateListener();
  }

  /**
   * コンテキストメニューの設定
   */
  private setupContextMenus(): void {
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.create({
        id: 'rakuten-csv-download',
        title: 'CSVをダウンロード',
        contexts: ['page'],
        documentUrlPatterns: ['https://*.rakuten-sec.co.jp/*']
      });

      chrome.contextMenus.create({
        id: 'open-rakuten-securities',
        title: '楽天証券を開く',
        contexts: ['action']
      });
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });
  }

  /**
   * コンテキストメニューのクリック処理
   */
  private handleContextMenuClick(
    info: chrome.contextMenus.OnClickData, 
    tab?: chrome.tabs.Tab
  ): void {
    switch (info.menuItemId) {
      case 'rakuten-csv-download':
        if (tab?.id) {
          this.triggerCsvDownload(tab.id);
        }
        break;
      case 'open-rakuten-securities':
        RakutenUtils.openRakutenPage();
        break;
    }
  }

  /**
   * 拡張機能アイコンクリック時の処理
   */
  private setupActionHandler(): void {
    chrome.action.onClicked.addListener((tab) => {
      if (tab.url && RakutenUtils.isRakutenSecurities(tab.url)) {
        if (tab.id) {
          this.triggerCsvDownload(tab.id);
        }
      } else {
        RakutenUtils.openRakutenPage();
      }
    });
  }

  /**
   * タブの更新監視
   */
  private setupTabUpdateListener(): void {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.updateBadgeForTab(tabId, tab.url);
      }
    });
  }

  /**
   * タブのバッジ表示を更新
   */
  private updateBadgeForTab(tabId: number, url: string): void {
    if (RakutenUtils.isRakutenSecurities(url)) {
      const pageType = RakutenUtils.detectPageType(url);
      
      chrome.action.setBadgeText({
        text: this.getBadgeTextForPageType(pageType),
        tabId
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: '#dc3545',
        tabId
      });

      chrome.action.setTitle({
        title: this.getTitleForPageType(pageType),
        tabId
      });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
      chrome.action.setTitle({ title: '楽天証券CSV拡張機能', tabId });
    }
  }

  /**
   * ページタイプに応じたバッジテキストを取得
   */
  private getBadgeTextForPageType(pageType: string): string {
    const badgeMap: Record<string, string> = {
      dividend: '配',
      transaction: '取',
      portfolio: 'P',
      unknown: '楽'
    };
    return badgeMap[pageType] || '';
  }

  /**
   * ページタイプに応じたタイトルを取得
   */
  private getTitleForPageType(pageType: string): string {
    const titleMap: Record<string, string> = {
      dividend: '楽天証券CSV拡張機能 - 配当金ページ',
      transaction: '楽天証券CSV拡張機能 - 取引履歴ページ',
      portfolio: '楽天証券CSV拡張機能 - ポートフォリオページ',
      unknown: '楽天証券CSV拡張機能 - 楽天証券'
    };
    return titleMap[pageType] || '楽天証券CSV拡張機能';
  }

  /**
   * CSVダウンロードをトリガー
   */
  private async triggerCsvDownload(tabId: number): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'download-csv',
        payload: {
          message: 'バックグラウンドからのCSVダウンロード要求',
          downloadType: 'all'
        }
      });
    } catch (error) {
      console.error('CSVダウンロードのトリガーに失敗:', error);
    }
  }
}

// バックグラウンドサービスの開始
new RakutenCsvBackgroundService();
