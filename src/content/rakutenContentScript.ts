import type { CsvDownloadMessage, DownloadResponse } from '../types';
import { RakutenUtils, DomUtils } from '../utils';

/**
 * 楽天証券 CSV拡張機能のコンテンツスクリプト（MPA対応）
 */
class RakutenCsvExtension {
  private static instance: RakutenCsvExtension | null = null;
  private isInitialized: boolean = false;
  private pageLoadStartTime: number = Date.now();

  constructor() {
    // MPAでは各ページで新しいインスタンスが必要だが
    // 短時間での重複初期化は防ぐ
    if (RakutenCsvExtension.instance) {
      const timeDiff = Date.now() - this.pageLoadStartTime;
      if (timeDiff < 1000) { // 1秒以内なら同じインスタンスを返す
        return RakutenCsvExtension.instance;
      }
    }

    RakutenCsvExtension.instance = this;
    this.initialize();
  }

  /**
   * 既存のインスタンスを取得または新規作成（MPA対応）
   */
  static getInstance(): RakutenCsvExtension {
    return new RakutenCsvExtension();
  }

  /**
   * 拡張機能の初期化（MPA対応）
   */
  private initialize(): void {
    if (this.isInitialized) {
      console.log('楽天証券CSV拡張機能は既に初期化済みです');
      return;
    }

    console.log('楽天証券CSV拡張機能が初期化されました（MPA対応）');
    this.setupMessageListener();
    this.setupMPANavigationListener();
    this.registerWithBackground();
    this.isInitialized = true;
  }

  /**
   * バックグラウンドサービスに拡張機能の存在を登録
   */
  private registerWithBackground(): void {
    chrome.runtime.sendMessage(
      {
        action: 'register-rakuten-tab',
        url: window.location.href,
        timestamp: Date.now()
      },
      (response) => {
        if (response?.success) {
          console.log('バックグラウンドサービスに登録されました');
        } else {
          console.warn('バックグラウンドサービスへの登録に失敗しました');
        }
      }
    );
  }

  /**
   * MPA対応のナビゲーション監視を設定
   */
  private setupMPANavigationListener(): void {
    // MPA（Multi-Page Application）対応
    // 各ページで独立して動作するため、状態の保存・復元を重視

    // ページ読み込み時の状態復旧
    this.restoreExtensionState();

    // ページアンロード時の状態保存
    this.setupPageUnloadHandlers();

    // ページ完全読み込み後の機能確保
    this.ensureExtensionReadiness();
  }

  /**
   * ページアンロード時のハンドラを設定（MPA対応）
   */
  private setupPageUnloadHandlers(): void {
    // beforeunload: ページを離れる直前に状態を保存
    window.addEventListener('beforeunload', () => {
      this.saveExtensionStateForMPA();
      console.log('ページアンロード前に状態を保存しました');
    });

    // pagehide: ページが隠される時（戻る/進むボタンなど）
    window.addEventListener('pagehide', () => {
      this.saveExtensionStateForMPA();
      console.log('ページ非表示時に状態を保存しました');
    });

    // visibilitychange: ページの可視状態が変わった時
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.saveExtensionStateForMPA();
      } else if (document.visibilityState === 'visible') {
        // ページが再表示された時に状態を復元
        this.restoreExtensionState();
        this.ensureExtensionFunctionality();
      }
    });
  }

  /**
   * 拡張機能の準備完了を確保（MPA対応）
   */
  private ensureExtensionReadiness(): void {
    // DOMが完全に読み込まれるまで待機
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.performMPAInitialization();
      });
    } else {
      // 既に読み込み完了している場合は即座に実行
      setTimeout(() => { this.performMPAInitialization(); }, 100);
    }

    // ページが完全に読み込まれた後の追加初期化
    window.addEventListener('load', () => {
      setTimeout(() => { this.performMPAInitialization(); }, 100);
    });
  }

  /**
   * MPA用の初期化処理
   */
  private performMPAInitialization(): void {
    console.log('MPA用初期化処理を実行中...');

    // 楽天証券サイトかどうかを再確認
    if (!RakutenUtils.isRakutenSecurities(window.location.href)) {
      console.log('楽天証券サイトではありません');
      return;
    }

    // バックグラウンドサービスに現在のページを通知
    this.notifyPageReady();

    // 拡張機能の機能が正常に動作することを確保
    this.ensureExtensionFunctionality();
  }

  /**
   * バックグラウンドサービスにページ準備完了を通知
   */
  private notifyPageReady(): void {
    chrome.runtime.sendMessage(
      {
        action: 'page-ready',
        url: window.location.href,
        timestamp: Date.now()
      },
      (response) => {
        if (response?.success) {
          console.log('ページ準備完了をバックグラウンドサービスに通知しました');
        }
      }
    );
  }

  /**
   * MPA用の拡張機能状態を保存
   */
  private saveExtensionStateForMPA(): void {
    const state = {
      isActive: true,
      lastActiveTime: Date.now(),
      domain: window.location.hostname,
      url: window.location.href,
      pageTitle: document.title,
      userAgent: navigator.userAgent.substring(0, 100) // 一意性を保つため
    };

    // セッションストレージとローカルストレージの両方に保存
    try {
      sessionStorage.setItem('rakuten_csv_extension_state', JSON.stringify(state));
      localStorage.setItem('rakuten_csv_extension_last_state', JSON.stringify(state));
    } catch (error) {
      console.warn('状態の保存に失敗しました:', error);
    }
  }

  /**
   * 拡張機能の状態を復旧（MPA対応）
   */
  private restoreExtensionState(): void {
    try {
      // まずセッションストレージから復旧を試行
      let savedState = sessionStorage.getItem('rakuten_csv_extension_state');

      // セッションストレージにない場合はローカルストレージから
      if (!savedState) {
        savedState = localStorage.getItem('rakuten_csv_extension_last_state');
      }

      if (savedState) {
        const state = JSON.parse(savedState);
        if (state.isActive && state.domain === window.location.hostname) {
          console.log('拡張機能の状態を復旧しました:', state);

          // 状態が5分以内のものなら有効と判断
          const timeDiff = Date.now() - state.lastActiveTime;
          if (timeDiff < 5 * 60 * 1000) {
            console.log('有効な状態を検出しました');
            return;
          }
        }
      }
    } catch (error) {
      console.warn('状態の復旧に失敗しました:', error);
    }
  }

  /**
   * 新しいページでの再初期化（MPA対応）
   */
  private reinitializeForNewPage(): void {
    console.log('新しいページでの拡張機能を再初期化中...');

    // 楽天証券サイトかどうかを再確認
    if (RakutenUtils.isRakutenSecurities(window.location.href)) {
      // バックグラウンドサービスに再登録
      this.registerWithBackground();

      // 拡張機能の機能が正常に動作するように必要な処理を実行
      this.ensureExtensionFunctionality();
    }
  }

  /**
   * 拡張機能の機能が正常に動作することを確保
   */
  private ensureExtensionFunctionality(): void {
    console.log('拡張機能の機能を確保しています...');

    // MPAでは各ページで独立して動作するため、
    // ページ固有の初期化処理をここで実行

    // 例：必要なDOM要素の確認、イベントリスナーの設定など
    this.verifyPageCompatibility();
  }

  /**
   * ページの互換性を確認
   */
  private verifyPageCompatibility(): void {
    const isRakutenSite = RakutenUtils.isRakutenSecurities(window.location.href);
    console.log('ページ互換性確認:', {
      url: window.location.href,
      isRakutenSite,
      readyState: document.readyState
    });
  }

  /**
   * Chrome拡張機能のメッセージリスナーを設定
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: CsvDownloadMessage | { action: string }, _, sendResponse) => {
        console.log('コンテンツスクリプトでメッセージを受信:', message);

        switch (message.action) {
          case 'execute-csv-download':
            console.log('CSVダウンロード実行指示を受信');
            this.handleCsvDownloadExecution(message)
              .then(response => sendResponse(response))
              .catch(error => { sendResponse({ success: false, error: error.message || 'ダウンロード実行に失敗しました' }); });
            return true;

          case 'extension-updated':
            console.log('拡張機能が更新されました - 再初期化を実行');
            this.reinitializeForNewPage();
            sendResponse({ success: true });
            return true;

          case 'tab-ready':
            console.log('バックグラウンドサービスからタブ準備完了の通知を受信');
            this.ensureExtensionFunctionality();
            sendResponse({ success: true });
            return true;

          case 'page-refresh':
            console.log('ページリフレッシュ要求を受信');
            this.performMPAInitialization();
            sendResponse({ success: true });
            return true;

          default:
            return false;
        }
      }
    );
  }

  /**
   * CSVダウンロード実行処理（Background経由）
   */
  private async handleCsvDownloadExecution(message: any): Promise<DownloadResponse> {
    const { downloadType, downloadStep, selectors, retryCount = 0 } = message.payload;

    console.log(`CSVダウンロードステップ実行: ${downloadStep}`, {
      downloadType,
      selectors,
      retryCount,
      url: window.location.href
    });

    try {
      // 現在のページが楽天証券サイトか確認
      if (!RakutenUtils.isRakutenSecurities(window.location.href))
        return { success: false, error: '楽天証券のサイトではありません' };

      // ページが完全に読み込まれているか確認
      if (document.readyState !== 'complete') {
        console.log('ページの読み込み完了を待機中...');
        await this.waitForPageLoad(1000);
      }

      switch (downloadStep) {
        case 'navigate-to-page':
          return await this.executeNavigateToPage(selectors, retryCount);

        case 'select-tab':
          return await this.executeSelectTab(selectors, retryCount);

        case 'select-period':
          return await this.executeSelectPeriod(selectors, retryCount);

        case 'display-data':
          return await this.executeDisplayData(selectors, retryCount);

        case 'download-csv':
          return await this.executeDownloadCsv(selectors, retryCount);

        default:
          return { success: false, error: `未対応のダウンロードステップです: ${downloadStep}` };
      }
    } catch (error) {
      console.error(`ステップ ${downloadStep} 実行エラー:`, error);
      return { success: false, error: error instanceof Error ? error.message : `ステップ ${downloadStep} の実行に失敗しました` };
    }
  }

  /**
   * ページ遷移を実行
   */
  private async executeNavigateToPage(selectors: any, retryCount: number = 0): Promise<DownloadResponse> {
    const { menuLink } = selectors;

    if (!menuLink)
      return { success: false, error: 'メニューリンクのセレクターが指定されていません' };

    console.log(`ページ遷移実行中 (試行回数: ${retryCount + 1})`);
    if (retryCount === 0)
      this.debugMenuElements();

    const element = await this.waitForElement(menuLink);
    if (DomUtils.safeClick(element)) {
      return { success: true, message: 'ページ遷移が完了しました' };
    } else {
      return { success: false, error: 'メニューリンクのクリックに失敗しました' };
    }
  }

  /**
   * タブ選択を実行
   */
  private async executeSelectTab(selectors: any, retryCount: number = 0): Promise<DownloadResponse> {
    const { tabSelector } = selectors;

    if (!tabSelector)
      return { success: false, error: 'タブセレクターが指定されていません' };

    console.log(`タブ選択実行中 (試行回数: ${retryCount + 1})`);
    const element = await this.waitForElement(tabSelector);

    if (DomUtils.safeClick(element)) {
      return { success: true, message: 'タブ選択が完了しました' };
    } else {
      return { success: false, error: 'タブのクリックに失敗しました' };
    }
  }

  /**
   * 期間選択を実行
   */
  private async executeSelectPeriod(selectors: any, retryCount: number = 0): Promise<DownloadResponse> {
    const { periodRadio } = selectors;

    if (!periodRadio)
      return { success: false, error: '期間選択セレクターが指定されていません' };

    console.log(`期間選択実行中 (試行回数: ${retryCount + 1})`);
    const element = await this.waitForElement(periodRadio);

    if (DomUtils.safeClick(element)) {
      return { success: true, message: '期間選択が完了しました' };
    } else {
      return { success: false, error: '期間選択ボタンのクリックに失敗しました' };
    }
  }

  /**
   * データ表示を実行
   */
  private async executeDisplayData(selectors: any, retryCount: number = 0): Promise<DownloadResponse> {
    const { displayButton } = selectors;

    if (!displayButton)
      return { success: false, error: '表示ボタンセレクターが指定されていません' };

    console.log(`データ表示実行中 (試行回数: ${retryCount + 1})`);
    const element = await this.waitForElement(displayButton);

    if (DomUtils.safeClick(element)) {
      return { success: true, message: 'データ表示が完了しました' };
    } else {
      return { success: false, error: '表示ボタンのクリックに失敗しました' };
    }
  }

  /**
   * CSVダウンロードを実行
   */
  private async executeDownloadCsv(selectors: any, retryCount: number = 0): Promise<DownloadResponse> {
    const { csvButton } = selectors;

    if (!csvButton)
      return { success: false, error: 'CSVボタンセレクターが指定されていません' };

    console.log(`CSVダウンロード実行中 (試行回数: ${retryCount + 1})`);
    const element = await this.waitForElement(csvButton);

    if (DomUtils.safeClick(element)) {
      return { success: true, message: 'CSVダウンロードが完了しました' };
    } else {
      return { success: false, error: 'CSVボタンが見つからないか非表示です' };
    }
  }

  /**
   * ページロードの完了を待つ
   */
  private async waitForPageLoad(timeout: number = 500): Promise<void> {
    return new Promise((resolve) => {
      let timeoutId: number;

      const checkComplete = () => {
        if (document.readyState === 'complete') {
          clearTimeout(timeoutId);
          resolve();
        }
      };

      // 既に読み込み完了している場合
      if (document.readyState === 'complete') {
        resolve();
        return;
      }

      // readystatechangeイベントを監視
      document.addEventListener('readystatechange', checkComplete);

      // タイムアウト設定
      timeoutId = setTimeout(() => {
        document.removeEventListener('readystatechange', checkComplete);
        resolve(); // タイムアウトしても続行
      }, timeout);
    });
  }

  /**
   * 要素が表示されるまで待機（MPA対応で強化）
   */
  private waitForElement(selectorGroup: string, timeout: number = 100): Promise<Element> {
    return new Promise((resolve, reject) => {
      // 複数のセレクターをカンマで分割して試行
      const selectors = selectorGroup.split(',').map(s => s.trim());

      // 最初に既存の要素をチェック
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`要素が見つかりました (即座): ${selector}`);
          resolve(element);
          return;
        }
      }

      let attempts = 0;
      const maxAttempts = timeout / 100;

      const observer = new MutationObserver(() => {
        attempts++;

        // 各セレクターを順番に試行
        for (const selector of selectors) {
          try {
            const element = document.querySelector(selector);
            if (element) {
              observer.disconnect();
              console.log(`要素が見つかりました (${attempts}回目の試行): ${selector}`);
              resolve(element);
              return;
            }
          } catch (error) {
            console.warn(`セレクター実行エラー: ${selector}`, error);
            continue;
          }
        }

        if (attempts >= maxAttempts) {
          observer.disconnect();
          console.error(`要素が見つかりませんでした (${attempts}回試行):`, selectors);
          reject(new Error(`要素が見つかりませんでした (${attempts}回試行): ${selectorGroup}`));
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素の待機がタイムアウトしました: ${selectorGroup}`));
      }, timeout);
    });
  }

  /**
   * デバッグ用: 現在のページのメニュー要素を探索
   */
  private debugMenuElements(): void {
    console.log('=== デバッグ: メニュー要素の探索開始 ===');

    // 楽天証券のマイメニュー関連の要素を探索
    const menuSelectors = [
      '.pcm-gl-mega-menu',
      '.pcm-gl-mega-list',
      'a[onclick*="memberPageJump"]',
      'a[onclick*="ass_"]',
      'a[data-ratid*="mymenu"]',
      '.pcm-gl-mega-list__link',
      'a[href*="possess"]',
      'a[href*="dividend"]',
      'a[onclick*="保有"]',
      'a[onclick*="配当"]'
    ];

    menuSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`見つかった要素 [${selector}]: ${elements.length}個`);
          elements.forEach((el, index) => {
            if (index < 3) { // 最初の3つだけ詳細表示
              const onclick = el.getAttribute('onclick');
              const href = el.getAttribute('href');
              const ratid = el.getAttribute('data-ratid');
              const text = el.textContent?.trim().substring(0, 50);
              console.log(`  ${index + 1}. テキスト: "${text}", onclick: "${onclick}", href: "${href}", data-ratid: "${ratid}"`);
            }
          });
        }
      } catch (error) {
        console.warn(`セレクター [${selector}] でエラー:`, error);
      }
    });

    // 現在のページURLとタイトルも確認
    console.log('現在のページ:', {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState
    });

    console.log('=== デバッグ: メニュー要素の探索終了 ===');
  }
}

/**
 * 楽天証券CSV拡張機能の初期化（MPA対応）
 */
const initializeRakutenCsvExtension = (): void => {
  if (!RakutenUtils.isRakutenSecurities(window.location.href)) {
    console.log('楽天証券のサイトではありません');
    return;
  }

  console.log('楽天証券CSV拡張機能を初期化中（MPA対応）...');
  RakutenCsvExtension.getInstance();
};

// MPAでは各ページで確実に初期化されるよう複数のタイミングで実行
console.log('楽天証券CSV拡張機能コンテンツスクリプトが読み込まれました');

// 即座に初期化を試行
initializeRakutenCsvExtension();

// DOMContentLoaded時に再度初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - 拡張機能を初期化');
    initializeRakutenCsvExtension();
  });
}

// ページ完全読み込み後にも再度初期化
window.addEventListener('load', () => {
  console.log('Window load - 拡張機能を初期化');
  setTimeout(() => { initializeRakutenCsvExtension(); }, 500);
});

// フォーカス時の初期化（タブ切り替え時など）
window.addEventListener('focus', () => {
  console.log('Window focus - 拡張機能を確認');
  if (RakutenUtils.isRakutenSecurities(window.location.href)) {
    initializeRakutenCsvExtension();
  }
});
