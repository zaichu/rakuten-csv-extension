import type { RakutenUrlConfig, CsvDownloadConfig, CsvDownloadType } from '../types';
import { CSV_DOWNLOAD_CONFIGS } from '../config/csvDownloadConfigs';

/**
 * 楽天証券関連のユーティリティクラス
 * サイト固有の機能とCSVダウンロード設定を提供
 */
export class RakutenUtils {
  private static readonly URL_CONFIG: RakutenUrlConfig = {
    baseUrl: 'https://www.rakuten-sec.co.jp',
    dividendPage: '/web/dividend/',
    transactionPage: '/web/transaction/',
    portfolioPage: '/web/portfolio/'
  };

  private static readonly DOMAIN_PATTERN = 'rakuten-sec.co.jp';

  /**
   * 楽天証券のサイトかどうかを判定
   */
  static isRakutenSecurities(url: string): boolean {
    try {
      return url.includes(this.DOMAIN_PATTERN);
    } catch (error) {
      console.warn('URL判定エラー:', error);
      return false;
    }
  }

  /**
   * 楽天証券のトップページを開く
   */
  static openRakutenPage(): void {
    try {
      chrome.tabs.create({
        url: this.URL_CONFIG.baseUrl
      });
    } catch (error) {
      console.error('楽天証券ページを開けませんでした:', error);
      // フォールバック：直接ブラウザで開く
      window.open(this.URL_CONFIG.baseUrl, '_blank');
    }
  }

  /**
   * CSVダウンロード設定を取得
   */
  static getCsvDownloadConfig(downloadType: CsvDownloadType): CsvDownloadConfig | null {
    return CSV_DOWNLOAD_CONFIGS[downloadType] || null;
  }

  /**
   * サポートされているダウンロードタイプの一覧を取得
   */
  static getSupportedDownloadTypes(): readonly CsvDownloadType[] {
    return ['assetbalance', 'dividend', 'domesticstock', 'mutualfund'] as const;
  }

  /**
   * ダウンロードタイプの表示名を取得
   */
  static getDownloadTypeDisplayName(downloadType: CsvDownloadType): string {
    const config = this.getCsvDownloadConfig(downloadType);
    return config?.description || downloadType;
  }

  /**
   * URLの構築
   */
  static buildUrl(path: string): string {
    try {
      const url = new URL(path, this.URL_CONFIG.baseUrl);
      return url.toString();
    } catch (error) {
      console.warn('URL構築エラー:', error);
      return this.URL_CONFIG.baseUrl + path;
    }
  }

  /**
   * 現在のページのURLからダウンロードタイプを推測
   */
  static inferDownloadTypeFromUrl(url: string): CsvDownloadType | null {
    if (!this.isRakutenSecurities(url)) return null;

    const urlLower = url.toLowerCase();

    if (urlLower.includes('possess') || urlLower.includes('portfolio')) {
      return 'assetbalance';
    }
    if (urlLower.includes('dividend')) {
      return 'dividend';
    }
    if (urlLower.includes('real_gain_loss') || urlLower.includes('transaction')) {
      // URLだけでは国内株式か投資信託かを判断できないため、nullを返す
      return null;
    }

    return null;
  }

  /**
   * 楽天証券の各種ページURLを取得
   */
  static getPageUrls() {
    return {
      base: this.URL_CONFIG.baseUrl,
      dividend: this.buildUrl(this.URL_CONFIG.dividendPage),
      transaction: this.buildUrl(this.URL_CONFIG.transactionPage),
      portfolio: this.buildUrl(this.URL_CONFIG.portfolioPage)
    };
  }
}
