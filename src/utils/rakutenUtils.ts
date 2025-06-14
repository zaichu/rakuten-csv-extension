import type { RakutenUrlConfig, CsvDownloadConfig, CsvDownloadType } from '../types';

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
    const configs: Record<CsvDownloadType, CsvDownloadConfig> = {
      'assetbalance': {
        downloadType: 'assetbalance',
        description: '保有銘柄',
        steps: ['navigate-to-page', 'download-csv'],
        selectors: {
          // マイメニューから保有銘柄のページに遷移 - 国内株式のリンクに対応
          menuLink: "a[onclick*='ass_jp_stk_possess_lst.do'][data-ratid='mem_pc_mymenu_jp-possess-lst'], .pcm-gl-mega-list__link[onclick*='possess']",
          // csvで保存ボタンを押下
          csvButton: "a[onclick*='csvOutput'], img[src*='btn-save-csv'], img[alt*='CSV']"
        }
      },
      'dividend': {
        downloadType: 'dividend',
        description: '配当金・分配金',
        steps: ['navigate-to-page', 'select-period', 'display-data', 'download-csv'],
        selectors: {
          // マイメニューから配当金・分配金のページに遷移 - より広範囲のセレクターを使用
          menuLink: "a[onclick*='ass_dividend_history.do'], a[data-ratid='mem_pc_mymenu_dividend-history'], a[href*='dividend'], a[href*='配当'], a[onclick*='配当'], .pcm-gl-mega-list__link[onclick*='dividend']",
          // 表示期間のラジオボタンをすべてを選択
          periodRadio: "img[alt*='すべて'][onclick*='dispTermClick']",
          // 表示するボタンを押下
          displayButton: "input[type='image'][onclick*='clickSearch'], input[src*='btn-disp-noicon'], input.roll",
          // csvで保存ボタンを押下
          csvButton: "a[onclick*='csvOutput'], img[src*='btn-save-csv'], img[alt*='CSV']"
        }
      },
      'domesticstock': {
        downloadType: 'domesticstock',
        description: '国内株式の実現損益',
        steps: ['navigate-to-page', 'select-period', 'display-data', 'download-csv'],
        selectors: {
          // マイメニューから実現損益のページに遷移 - 正確なonclickパターンを使用
          menuLink: "a[onclick*='ass_real_gain_loss.do'], a[data-ratid='mem_pc_mymenu_real-gain-loss']",
          // 国内株式タブを選択
          tabSelector: "#ass_fu_real_gain_loss_tab > ul > li.first-child.pcmm-tab__item > a",
          // 表示期間のラジオボタンをすべてを選択
          periodRadio: "#termCdALL",
          // この条件で表示するボタン押下
          displayButton: "#str-container > div > main > form:nth-child(10) > div:nth-child(3) > div.pcmm-ass-real-gl-toggle.pcmm--is-mb-24 > div > button",
          // csv保存ボタンを押下
          csvButton: "#str-container > div > main > form:nth-child(10) > div:nth-child(7) > div > button:nth-child(3)"
        }
      },
      'mutualfund': {
        downloadType: 'mutualfund',
        description: '投資信託の実現損益',
        steps: ['navigate-to-page', 'select-tab', 'select-period', 'display-data', 'download-csv'],
        selectors: {
          // マイメニューから投資信託取引履歴のページに遷移 - 正確なonclickパターンを使用
          menuLink: "a[onclick*='ass_real_gain_loss.do'], a[data-ratid='mem_pc_mymenu_real-gain-loss']",
          // 投資信託タブを選択
          tabSelector: "#str-container > div > main > form:nth-child(10) > div:nth-child(3) > ul > li:nth-child(2) > a",
          // 表示期間のラジオボタンをすべてを選択
          periodRadio: "#termCdALL",
          // この条件で表示するボタン押下
          displayButton: "#str-container > div > main > form:nth-child(16) > div:nth-child(18) > div.pcmm-ass-real-gl-toggle.pcmm--is-mb-24 > div > button",
          // csv保存ボタンを押下
          csvButton: "#str-container > div > main > form:nth-child(16) > div:nth-child(19) > div > button:nth-child(3)"
        }
      }
    };

    return configs[downloadType] || null;
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
