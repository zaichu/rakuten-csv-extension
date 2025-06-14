/**
 * 楽天証券CSV拡張機能のバックグラウンドサービス（MPA対応）
 * 
 * MPA（Multi-Page Application）対応の特徴：
 * - 各ページ遷移で完全にページがリロードされる
 * - コンテンツスクリプトも各ページで新しく読み込まれる
 * - 状態の永続化は sessionStorage/localStorage で行う
 * - タブ間の通信は Chrome Extension API を経由する
 */

// 拡張機能の状態管理
interface ExtensionState {
  activeTabId?: number;
  rakutenTabs: Set<number>;
  lastActiveTime: number;
}

const extensionState: ExtensionState = {
  rakutenTabs: new Set(),
  lastActiveTime: Date.now()
};

// 拡張機能インストール時の処理
chrome.runtime.onInstalled.addListener((details) => {
  console.log('楽天証券CSV拡張機能がインストールされました', details);

  if (details.reason === 'install') {
    console.log('初回インストール');
    initializeExtension();
  } else if (details.reason === 'update') {
    console.log('拡張機能が更新されました');
    updateExtension();
  }
});

// 拡張機能起動時の処理
chrome.runtime.onStartup.addListener(() => {
  console.log('楽天証券CSV拡張機能が起動しました');
  initializeExtension();
});

// タブ更新時の処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleTabUpdate(tabId, tab.url);
  }
});

// タブ削除時の処理
chrome.tabs.onRemoved.addListener((tabId) => {
  extensionState.rakutenTabs.delete(tabId);
  if (extensionState.activeTabId === tabId) {
    extensionState.activeTabId = undefined;
  }
  console.log('楽天証券タブが削除されました:', tabId);
});

// タブアクティブ化時の処理
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && isRakutenSecurities(tab.url)) {
      extensionState.activeTabId = activeInfo.tabId;
      extensionState.lastActiveTime = Date.now();
      console.log('楽天証券タブがアクティブになりました:', activeInfo.tabId);
    }
  });
});

// アイコンクリック時の処理
chrome.action.onClicked.addListener((tab) => {
  console.log('拡張機能アイコンがクリックされました', tab);

  if (tab.url && isRakutenSecurities(tab.url)) {
    extensionState.activeTabId = tab.id;
    extensionState.lastActiveTime = Date.now();
  }
});

// メッセージ処理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('バックグラウンドでメッセージを受信:', message);

  switch (message.action) {
    case 'background-action':
      sendResponse({ success: true });
      break;

    case 'register-rakuten-tab':
      if (sender.tab?.id) {
        extensionState.rakutenTabs.add(sender.tab.id);
        extensionState.activeTabId = sender.tab.id;
        extensionState.lastActiveTime = Date.now();
        console.log('楽天証券タブが登録されました:', sender.tab.id, message.url || '');
        sendResponse({ success: true });
      }
      break;

    case 'page-ready':
      if (sender.tab?.id) {
        console.log('ページ準備完了通知を受信:', sender.tab.id, message.url || '');
        extensionState.rakutenTabs.add(sender.tab.id);
        extensionState.activeTabId = sender.tab.id;
        extensionState.lastActiveTime = Date.now();
        sendResponse({ success: true });
      }
      break;

    case 'download-csv-request':
      handleCsvDownloadRequest(message, sendResponse);
      return true; // 非同期レスポンス

    case 'get-extension-state':
      sendResponse({
        success: true,
        state: {
          activeTabId: extensionState.activeTabId,
          rakutenTabsCount: extensionState.rakutenTabs.size,
          lastActiveTime: extensionState.lastActiveTime
        }
      });
      break;

    default:
      sendResponse({ success: false, error: '不明なアクション' });
  }

  return true; // 非同期レスポンスを有効にする
});

/**
 * 拡張機能の初期化
 */
function initializeExtension(): void {
  console.log('拡張機能を初期化中...');

  // 既存の楽天証券タブを検索
  chrome.tabs.query({ url: '*://*.rakuten-sec.co.jp/*' }, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        extensionState.rakutenTabs.add(tab.id);
        console.log('既存の楽天証券タブを発見:', tab.id);
      }
    });
  });
}

/**
 * 拡張機能の更新処理
 */
function updateExtension(): void {
  console.log('拡張機能を更新中...');

  // 更新時に既存タブに拡張機能の再読み込みを通知
  extensionState.rakutenTabs.forEach(tabId => {
    chrome.tabs.sendMessage(tabId, { action: 'extension-updated' }, (_response) => {
      if (chrome.runtime.lastError) {
        console.log('タブへの通知に失敗:', chrome.runtime.lastError.message);
        extensionState.rakutenTabs.delete(tabId);
      }
    });
  });
}

/**
 * タブ更新時の処理（MPA対応強化）
 */
function handleTabUpdate(tabId: number, url: string): void {
  if (isRakutenSecurities(url)) {
    extensionState.rakutenTabs.add(tabId);
    console.log('楽天証券サイトが読み込まれました:', tabId, url);

    // MPAでは各ページ読み込み時にコンテンツスクリプトが新しく読み込まれるため
    // 少し長めの待機時間を設定してから通知
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'tab-ready' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('コンテンツスクリプトへの通知に失敗（通常動作）:', chrome.runtime.lastError.message);
          // MPAでは読み込み中のケースが多いため、さらに待機してリトライ
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'page-refresh' }, (retryResponse) => {
              if (chrome.runtime.lastError) {
                console.log('コンテンツスクリプトへのリトライも失敗:', chrome.runtime.lastError.message);
              } else if (retryResponse?.success) {
                console.log('コンテンツスクリプトとの通信が確立されました（リトライ成功）');
              }
            });
          }, 2000);
        } else if (response?.success) {
          console.log('コンテンツスクリプトとの通信が確立されました');
        }
      });
    }, 1500); // MPAのため長めの待機時間
  } else {
    extensionState.rakutenTabs.delete(tabId);
  }
}

/**
 * CSVダウンロードリクエストを処理
 */
async function handleCsvDownloadRequest(message: any, sendResponse: (response: any) => void): Promise<void> {
  const { selectedOptions, tabId } = message.payload;

  console.log('CSVダウンロードリクエストを受信:', { selectedOptions, tabId });

  try {
    // ダウンロード設定を取得
    for (const downloadType in selectedOptions) {
      const downloadConfig = getCsvDownloadConfig(downloadType);
      if (!downloadConfig) {
        sendResponse({
          success: false,
          error: `未対応のダウンロードタイプです: ${downloadType}`
        });
        continue;
      }

      console.log('ダウンロード設定:', downloadConfig);

      // タブIDが指定されていない場合はアクティブタブを取得
      let targetTabId = tabId;
      if (!targetTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) {
          sendResponse({ success: false, error: 'ターゲットタブが見つかりません' });
          return;
        }
        targetTabId = activeTab.id;
      }

      // 楽天証券タブかどうか確認
      if (!extensionState.rakutenTabs.has(targetTabId)) {
        sendResponse({ success: false, error: '楽天証券のタブではありません' });
        return;
      }

      // ダウンロード処理を開始
      executeCsvDownloadSequence(targetTabId, downloadConfig, sendResponse);
    }
  } catch (error) {
    console.error('CSVダウンロードリクエスト処理エラー:', error);
    sendResponse({ success: false, error: error instanceof Error ? error.message : '予期しないエラーが発生しました' });
  }
}

/**
 * CSVダウンロードの設定を取得
 */
function getCsvDownloadConfig(downloadType: string): any {
  const configs: Record<string, any> = {
    'assetbalance': {
      downloadType: 'assetbalance',
      description: '保有銘柄',
      steps: ['navigate-to-page', 'download-csv'],
      selectors: {
        // マイメニューから保有銘柄のページに遷移 - より広範囲のセレクターを使用
        menuLink: "a[onclick*='ass_all_possess_lst.do'], a[data-ratid='mem_pc_mymenu_all-possess-lst'], a[href*='possess'], a[href*='保有'], a[onclick*='保有'], .pcm-gl-mega-list__link[onclick*='possess']",
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
        tabSelector: "a[href*='domestic'], a[contains(text(), '国内株式')], .tab-domestic, #domestic-tab, .domestic-stock-tab",
        // 表示期間のラジオボタンをすべてを選択
        periodRadio: "input[type='radio'][value*='all'], input[type='radio'][value*='すべて'], input[type='radio'][value*='全'], .period-all, #period-all",
        // この条件で表示するボタン押下
        displayButton: "input[value*='表示'], button[contains(text(), '表示')], input[type='submit'][value*='表示'], .display-button, .search-button",
        // csv保存ボタンを押下
        csvButton: "input[value*='CSV'], button[contains(text(), 'CSV')], input[type='submit'][value*='CSV'], button[type='submit'][value*='CSV'], .csv-button, .download-csv"
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
        tabSelector: "a[href*='fund'], a[href*='mutual'], a[contains(text(), '投資信託')], .tab-fund, #fund-tab, .mutual-fund-tab",
        // 表示期間のラジオボタンをすべてを選択
        periodRadio: "input[type='radio'][value*='all'], input[type='radio'][value*='すべて'], input[type='radio'][value*='全'], .period-all, #period-all",
        // この条件で表示するボタン押下
        displayButton: "input[value*='表示'], button[contains(text(), '表示')], input[type='submit'][value*='表示'], .display-button, .search-button",
        // csv保存ボタンを押下
        csvButton: "input[value*='CSV'], button[contains(text(), 'CSV')], input[type='submit'][value*='CSV'], button[type='submit'][value*='CSV'], .csv-button, .download-csv"
      }
    }
  };

  return configs[downloadType] || null;
}

/**
 * CSVダウンロードのシーケンスを実行（改良版）
 */
async function executeCsvDownloadSequence(
  tabId: number,
  config: any,
  sendResponse: (response: any) => void
): Promise<void> {
  let currentStepIndex = 0;
  const steps = config.steps;
  const maxRetries = 2; // 各ステップの最大リトライ回数

  const executeNextStep = async (retryCount: number = 0) => {
    if (currentStepIndex >= steps.length) {
      // 全ステップ完了
      sendResponse({
        success: true,
        message: `${config.description}のCSVダウンロードが完了しました`
      });
      return;
    }

    const currentStep = steps[currentStepIndex];
    console.log(`ステップ ${currentStepIndex + 1}/${steps.length}: ${currentStep} を実行中... (試行回数: ${retryCount + 1})`);

    try {
      // タブが存在するか確認
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        sendResponse({
          success: false,
          error: 'タブが見つかりません。ページが閉じられた可能性があります。'
        });
        return;
      }

      // コンテンツスクリプトにステップ実行を指示
      chrome.tabs.sendMessage(tabId, {
        action: 'execute-csv-download',
        payload: {
          downloadType: config.downloadType,
          downloadStep: currentStep,
          selectors: config.selectors,
          retryCount: retryCount
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('コンテンツスクリプト通信エラー:', chrome.runtime.lastError.message);

          if (retryCount < maxRetries) {
            console.log(`ステップ ${currentStep} をリトライします (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => executeNextStep(retryCount + 1), 1000);
          } else {
            sendResponse({
              success: false,
              error: `コンテンツスクリプトとの通信に失敗しました (ステップ: ${currentStep})`
            });
          }
          return;
        }

        if (response?.success) {
          console.log(`ステップ ${currentStep} 完了`);
          currentStepIndex++;

          // 次のステップまで適切な待機時間
          const waitTime = getWaitTimeForStep(currentStep);
          setTimeout(() => executeNextStep(0), waitTime);
        } else {
          console.error(`ステップ ${currentStep} 失敗:`, response?.error);

          if (retryCount < maxRetries) {
            console.log(`ステップ ${currentStep} をリトライします (${retryCount + 1}/${maxRetries})`);
            setTimeout(() => executeNextStep(retryCount + 1), 3000);
          } else {
            sendResponse({
              success: false,
              error: response?.error || `ステップ ${currentStep} の実行に失敗しました（${maxRetries + 1}回試行）`
            });
          }
        }
      });
    } catch (error) {
      console.error(`ステップ ${currentStep} 実行エラー:`, error);

      if (retryCount < maxRetries) {
        console.log(`ステップ ${currentStep} をリトライします (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => executeNextStep(retryCount + 1), 500);
      } else {
        sendResponse({
          success: false,
          error: `ステップ ${currentStep} の実行中にエラーが発生しました`
        });
      }
    }
  };

  // 最初のステップを実行
  executeNextStep();
}

/**
 * ステップに応じた適切な待機時間を取得
 */
function getWaitTimeForStep(step: string): number {
  const waitTimes: Record<string, number> = {
    'navigate-to-page': 100,    // ページ遷移は短めに待機
    'select-tab': 100,          // タブ切り替え
    'select-period': 100,       // 期間選択
    'display-data': 100,        // データ表示（データ読み込み待機）
    'download-csv': 100         // CSV保存
  };

  return waitTimes[step] || 1500; // デフォルト1.5秒
}

/**
 * 楽天証券のサイトかどうかを判定
 */
function isRakutenSecurities(url: string): boolean {
  return url.includes('rakuten-sec.co.jp');
}

console.log('楽天証券CSV拡張機能のバックグラウンドサービスが読み込まれました');
