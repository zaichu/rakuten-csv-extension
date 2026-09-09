import type { CsvDownloadConfig, CsvDownloadType } from '../types';

/**
 * CSVダウンロード設定データ
 * セレクター定義を含む静的データ（ロジックなし）
 */
export const CSV_DOWNLOAD_CONFIGS: Record<CsvDownloadType, CsvDownloadConfig> = {
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
      // tabSelector: "#ass_fu_real_gain_loss_tab > ul > li.first-child.pcmm-tab__item > a",
      // 表示期間のラジオボタンをすべてを選択
      periodRadio: "#termCdALL",
      // この条件で表示するボタン押下
      displayButton: "button[onclick*='search()']",
      // csv保存ボタンを押下
      csvButton: "button[onclick*='csvDownLoad()']"
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
      tabSelector: "a[href*='ass_fu_real_gain_loss.do']",
      // 表示期間のラジオボタンをすべてを選択
      periodRadio: "#termCdALL",
      // この条件で表示するボタン押下
      displayButton: "button[onclick*='search()']",
      // csv保存ボタンを押下
      csvButton: "button[onclick*='csvDownLoad()']"
    }
  }
};
