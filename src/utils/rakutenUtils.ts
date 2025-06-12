import type { RakutenUrlConfig } from '../types';

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
}
