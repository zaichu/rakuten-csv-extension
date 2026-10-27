import type { CsvDownloadConfig, CsvDownloadType } from '../types';
import { CSV_DOWNLOAD_CONFIGS } from '../config/csvDownloadConfigs';

/**
 * 楽天証券関連のユーティリティクラス
 * サイト固有の機能とCSVダウンロード設定を提供
 */
export class RakutenUtils {
  /** 楽天証券のトップページ（未ログイン時はログイン画面へ遷移する） */
  static readonly BASE_URL = 'https://www.rakuten-sec.co.jp';

  private static readonly DOMAIN_PATTERN = 'rakuten-sec.co.jp';

  /** 証券Webのトップページ */
  static readonly SHOKEN_WEB_URL = 'https://shoken-webapp.pages.dev';

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
   * 証券Webのトップページを新しいタブで開く
   */
  static async openShokenWebPage(): Promise<void> {
    if (!chrome?.tabs?.create) {
      const error = new Error('Chrome拡張機能のAPIが利用できません');
      console.error('証券Webページを開けませんでした:', error);
      throw error;
    }

    try {
      await chrome.tabs.create({ url: this.SHOKEN_WEB_URL });
    } catch (error) {
      console.error('証券Webページを開けませんでした:', error);
      throw error;
    }
  }

  /**
   * CSVダウンロード設定を取得
   */
  static getCsvDownloadConfig(downloadType: CsvDownloadType): CsvDownloadConfig | null {
    return CSV_DOWNLOAD_CONFIGS[downloadType] || null;
  }
}
