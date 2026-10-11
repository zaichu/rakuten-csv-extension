import type { CsvDownloadConfig, CsvDownloadType } from '../types';
import { CSV_DOWNLOAD_CONFIGS } from '../config/csvDownloadConfigs';

/**
 * 楽天証券関連のユーティリティクラス
 * サイト固有の機能とCSVダウンロード設定を提供
 */
export class RakutenUtils {
  private static readonly BASE_URL = 'https://www.rakuten-sec.co.jp';

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
        url: this.BASE_URL
      });
    } catch (error) {
      console.error('楽天証券ページを開けませんでした:', error);
      // フォールバック：直接ブラウザで開く
      window.open(this.BASE_URL, '_blank');
    }
  }

  /**
   * CSVダウンロード設定を取得
   */
  static getCsvDownloadConfig(downloadType: CsvDownloadType): CsvDownloadConfig | null {
    return CSV_DOWNLOAD_CONFIGS[downloadType] || null;
  }
}
