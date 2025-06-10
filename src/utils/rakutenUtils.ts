import type { RakutenPageType, RakutenUrlConfig } from '../types';

/**
 * 楽天証券関連のユーティリティ関数
 */
export class RakutenUtils {
  private static readonly URL_CONFIG: RakutenUrlConfig = {
    baseUrl: 'https://www.rakuten-sec.co.jp',
    dividendPage: '/web/dividend/',
    transactionPage: '/web/transaction/',
    portfolioPage: '/web/portfolio/'
  };

  /**
   * 現在のURLから楽天証券のページタイプを判定
   */
  static detectPageType(url: string): RakutenPageType {
    if (!this.isRakutenSecurities(url)) {
      return 'unknown';
    }

    if (url.includes(this.URL_CONFIG.dividendPage)) {
      return 'dividend';
    }
    if (url.includes(this.URL_CONFIG.transactionPage)) {
      return 'transaction';
    }
    if (url.includes(this.URL_CONFIG.portfolioPage)) {
      return 'portfolio';
    }

    return 'unknown';
  }

  /**
   * 楽天証券のサイトかどうかを判定
   */
  static isRakutenSecurities(url: string): boolean {
    return url.includes('rakuten-sec.co.jp');
  }

  /**
   * 楽天証券のトップページを開く
   */
  static openRakutenPage(): void {
    chrome.tabs.create({
      url: this.URL_CONFIG.baseUrl
    });
  }

  /**
   * 特定のページのURLを生成
   */
  static generatePageUrl(pageType: RakutenPageType): string {
    const pageMap = {
      dividend: this.URL_CONFIG.dividendPage,
      transaction: this.URL_CONFIG.transactionPage,
      portfolio: this.URL_CONFIG.portfolioPage,
      unknown: '/'
    };

    return `${this.URL_CONFIG.baseUrl}${pageMap[pageType]}`;
  }

  /**
   * CSVダウンロード用のファイル名を生成
   */
  static generateCsvFileName(pageType: RakutenPageType): string {
    const timestamp = new Date().toISOString().slice(0, 10);
    const pageTypeMap = {
      dividend: '配当金',
      transaction: '取引履歴',
      portfolio: 'ポートフォリオ',
      unknown: 'データ'
    };

    return `楽天証券_${pageTypeMap[pageType]}_${timestamp}.csv`;
  }
}
