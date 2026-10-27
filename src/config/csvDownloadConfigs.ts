import type { CsvDownloadConfig, CsvDownloadType, CsvSelectors } from '../types';

/**
 * 実現損益系の共通セレクター
 *
 * 将来セレクターが分岐したら呼び出し側でオーバーライドする
 */
const realGainLossBaseSelectors: CsvSelectors = {
  menuLink: "a[onclick*='ass_real_gain_loss.do'], a[data-ratid='mem_pc_mymenu_real-gain-loss']",
  periodRadio: "#termCdALL",
  displayButton: "[onclick*='search()']",
  csvButton: "[onclick*='csvDownLoad()']"
};

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
      // 'possess' を広く拾う代替セレクターは投資信託のリンク(ass_fu_possess_lst.do)にも
      // マッチしてしまうため除外する
      menuLink: "a[onclick*='ass_jp_stk_possess_lst.do'][data-ratid='mem_pc_mymenu_jp-possess-lst'], .pcm-gl-mega-list__link[onclick*='possess']:not([onclick*='ass_fu_possess_lst.do'])",
      // csvで保存ボタンを押下
      csvButton: "[onclick*='csvOutput'], img[src*='btn-save-csv'], img[alt*='CSV']"
    }
  },
  'fundbalance': {
    downloadType: 'fundbalance',
    description: '投資信託の保有残高',
    steps: ['navigate-to-page', 'download-csv'],
    selectors: {
      // マイメニューから投資信託の保有一覧ページに遷移
      menuLink: "a[onclick*='ass_fu_possess_lst.do'], a[data-ratid='mem_pc_mymenu_fu-possess-lst']",
      // csvで保存ボタンを押下
      csvButton: "[onclick*='csvDownLoad()'], input[type='image'][src*='btn-save-csv']"
    }
  },
  'dividend': {
    downloadType: 'dividend',
    description: '配当金・分配金',
    steps: ['navigate-to-page', 'select-period', 'display-data', 'download-csv'],
    selectors: {
      // マイメニューから配当金・分配金のページに遷移 - より広範囲のセレクターを使用
      menuLink: "a[onclick*='ass_dividend_history.do'], a[data-ratid='mem_pc_mymenu_dividend-history'], a[href*='dividend'], a[href*='配当'], a[onclick*='配当'], .pcm-gl-mega-list__link[onclick*='dividend']",
      // 表示期間のラジオボタンをすべてを選択（label クリックで onclick 発火 + ラジオチェック）
      periodRadio: "[onclick*=\"dispTermClick('0')\"], #termCdAll",
      // 表示するボタンを押下
      displayButton: "[onclick*='clickSearch']",
      // csvで保存ボタンを押下
      csvButton: "[onclick*='csvOutput']"
    }
  },
  'domesticstock': {
    downloadType: 'domesticstock',
    description: '国内株式の実現損益',
    steps: ['navigate-to-page', 'select-period', 'display-data', 'download-csv'],
    selectors: { ...realGainLossBaseSelectors }
  },
  'mutualfund': {
    downloadType: 'mutualfund',
    description: '投資信託の実現損益',
    steps: ['navigate-to-page', 'select-tab', 'select-period', 'display-data', 'download-csv'],
    selectors: {
      ...realGainLossBaseSelectors,
      tabSelector: "a[href*='ass_fu_real_gain_loss.do']"
    }
  }
};
