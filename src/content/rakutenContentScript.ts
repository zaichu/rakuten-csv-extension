import type {
  CsvDownloadStepsInstruction,
  ContentScriptMessage,
  ContentScriptResponse,
  DownloadResponse,
  LoginStateResponse,
  PageReadyMessage,
  ChromeMessage,
  CsvDownloadStep,
  CsvSelectors
} from '../types';
import { RakutenUtils, DomUtils, withTimeout } from '../utils';

/**
 * 楽天証券 CSV拡張機能のコンテンツスクリプト
 * シングルトンパターンで実装し、メッセージリスナーを管理
 */
class RakutenCsvExtension {
  private static instance: RakutenCsvExtension | null = null;
  private readonly elementTimeout = 5000;
  private readonly notifyTimeout = 2000;

  /** パスキーボタンを押下済みか */
  private passkeyLoginClicked = false;
  /** パスキーボタンの出現を監視するMutationObserver */
  private passkeyButtonObserver: MutationObserver | null = null;

  private constructor() {
    this.initialize();
  }

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): RakutenCsvExtension {
    if (!RakutenCsvExtension.instance) {
      RakutenCsvExtension.instance = new RakutenCsvExtension();
    }
    return RakutenCsvExtension.instance;
  }

  /**
   * テスト用：シングルトンインスタンスをリセット
   */
  static resetInstance(): void {
    RakutenCsvExtension.instance = null;
  }

  /**
   * 拡張機能の初期化
   */
  private initialize(): void {
    console.log('楽天証券CSV拡張機能を初期化中...');

    try {
      this.setupMessageListener();
      this.notifyPageReady();
      console.log('楽天証券CSV拡張機能の初期化が完了しました');
    } catch (error) {
      console.error('楽天証券CSV拡張機能の初期化に失敗:', error);
    }
  }

  /**
   * メッセージリスナーを設定
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: ContentScriptMessage, _sender, sendResponse) => {
        // 取得URLなどが記録されないよう action のみログに残す
        console.log('コンテンツスクリプトでメッセージを受信:', message.action);

        // 非同期処理を適切に処理
        this.handleMessage(message)
          .then(response => {
            sendResponse(response);
          })
          .catch(error => {
            console.error('メッセージ処理でエラーが発生:', error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'メッセージ処理に失敗しました'
            });
          });

        // 非同期レスポンスを有効にする
        return true;
      }
    );
  }

  /**
   * メッセージを処理
   */
  private async handleMessage(message: ContentScriptMessage): Promise<ContentScriptResponse> {
    switch (message.action) {
      case 'execute-csv-download-steps':
        return this.handleCsvDownloadStepsExecution(message);

      case 'check-login-state':
        return this.handleCheckLoginState();

      case 'extension-updated':
        this.handleExtensionUpdate();
        return { success: true, message: '拡張機能が更新されました' };

case 'fetch-started':
        this.handleFetchStarted();
        return { success: true };

      case 'check-connection':
        return { success: true };

      default:
        return {
          success: false,
          error: `未対応のアクション: ${(message as ChromeMessage).action}`
        };
    }
  }

  /**
   * 取得開始通知を受信
   *
   * バックグラウンドから取得開始の合図を受け取ったら、パスキーボタンの
   * 出現を監視し、表示されたら即座にクリックする。
   */
  private handleFetchStarted(): void {
    this.startPasskeyButtonObserver();
  }

  /**
   * パスキーボタンの出現を監視開始
   *
   * MutationObserverでボタンがDOMに追加されたら即座にクリックする。
   * 既にボタンが存在する場合は即座にクリックする。
   */
  private startPasskeyButtonObserver(): void {
    // 既にボタンがあれば即クリック
    const existingButton = document.querySelector('button#login-passkey');
    if (existingButton) {
      this.clickPasskeyLoginButtonOnce();
      return;
    }

    // 既に監視中なら何もしない
    if (this.passkeyButtonObserver) {
      return;
    }

    this.passkeyButtonObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // 追加されたノードがボタン自身、またはボタンを含む場合
            if (element.matches('button#login-passkey') || element.querySelector('button#login-passkey')) {
              this.clickPasskeyLoginButtonOnce();
              this.stopPasskeyButtonObserver();
              return;
            }
          }
        }
      }
    });

    this.passkeyButtonObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * パスキーボタンの監視を停止
   */
  private stopPasskeyButtonObserver(): void {
    if (this.passkeyButtonObserver) {
      this.passkeyButtonObserver.disconnect();
      this.passkeyButtonObserver = null;
    }
  }

  /**
   * ログイン状態の確認
   *
   * 氏名や口座番号などの個人情報は読まず、ログイン画面かどうかだけを見る
   * パスキーボタンのクリックは fetch-started 通知を受けた後の
   * MutationObserver で行うため、ここではクリックしない
   */
  private handleCheckLoginState(): LoginStateResponse {
    const loggedIn = !this.isLoginScreen();
    return { success: true, loggedIn };
  }

  /**
   * ログイン画面のパスキーボタンを1回だけクリックする
   *
   * 認証ダイアログをユーザーがキャンセルしてもボタンは残るため、
   * 同一ページ内で繰り返し押さないよう押下済みフラグを持つ
   */
  private clickPasskeyLoginButtonOnce(): void {
    if (this.passkeyLoginClicked) {
      return;
    }

    const button = document.querySelector('button#login-passkey');
    if (!button) {
      return;
    }

    this.passkeyLoginClicked = true;
    this.clickElementSafely(button, 'パスキーログイン');
  }

  private isLoginScreen(): boolean {
    if (document.querySelector('input[type="password"]')) {
      return true;
    }
    return /\/login/i.test(window.location.pathname);
  }

  /**
   * 拡張機能更新の処理
   *
   * 更新でバックグラウンドが再起動するとタブ登録が消えるため、
   * page-ready を送り直して再登録する。リスナーはcontent script側で
   * 生きているので再登録しない（重複登録になる）。
   */
  private handleExtensionUpdate(): void {
    console.log('拡張機能が更新されました。再登録します。');
    this.notifyPageReady();
  }

  /**
   * ステップ列をまとめて実行
   *
   * navigate-to-page/select-tab/display-data のようにページ遷移・ページ更新を
   * 伴い得るステップはバックグラウンド側で1要素の配列にして送られる。
   */
  private async handleCsvDownloadStepsExecution(
    message: CsvDownloadStepsInstruction
  ): Promise<DownloadResponse> {
    const { downloadSteps, selectors, captureDownloadStart } = message.payload;

    console.log(`CSVダウンロードステップ群実行: ${downloadSteps.join(', ')}`);

    // 楽天証券サイトの確認
    if (!RakutenUtils.isRakutenSecurities(window.location.href)) {
      return {
        success: false,
        error: '楽天証券のサイトではありません',
        step: downloadSteps[0]
      };
    }

    for (const step of downloadSteps) {
      try {
        const result = await this.executeDownloadStep(step, selectors, captureDownloadStart);
        console.log(`ステップ ${step} 完了:`, result);

        if (!result.success) {
          return { ...result, step };
        }
      } catch (error) {
        console.error(`ステップ ${step} 実行エラー:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : `ステップ ${step} の実行に失敗しました`,
          step
        };
      }
    }

    return {
      success: true,
      message: 'ステップ群の実行が完了しました'
    };
  }

  /**
   * ダウンロードステップを実行
   */
  private async executeDownloadStep(
    step: CsvDownloadStep,
    selectors: CsvSelectors,
    captureDownloadStart?: boolean
  ): Promise<DownloadResponse> {
    switch (step) {
      case 'navigate-to-page':
        return this.runClickStep(selectors.menuLink, 'ページ遷移');

      case 'select-tab':
        return this.runClickStep(selectors.tabSelector, 'タブ選択');

      case 'select-period':
        return this.runClickStep(selectors.periodRadio, '期間選択');

      case 'display-data':
        return this.runClickStep(selectors.displayButton, 'データ表示', { requireInteractable: true });

      case 'download-csv':
        return this.runClickStep(selectors.csvButton, 'CSVダウンロード', {
          requireInteractable: true,
          beforeClick: captureDownloadStart ? () => this.notifyDownloadWillStart() : undefined,
          clickAfterResponse: true
        });

      default:
        return { 
          success: false, 
          error: `未対応のダウンロードステップです: ${step}`,
          step
        };
    }
  }

  /**
   * クリック系ステップの汎用実行
   * navigate-to-page/select-tab/select-period/display-data/download-csv は
   * 「セレクター未指定チェック→要素検索→安全なクリック」の同一処理のため1つに統合。
   * display-data/download-csv のみ操作可能要素を必須とする。
   */
  private async runClickStep(
    selector: string | undefined,
    actionName: string,
    options?: {
      requireInteractable?: boolean;
      beforeClick?: () => Promise<void>;
      clickAfterResponse?: boolean;
    }
  ): Promise<DownloadResponse> {
    if (!selector) {
      return { success: false, error: `${actionName}のセレクターが指定されていません` };
    }

    const element = options?.requireInteractable
      ? await this.findElement(selector, this.elementTimeout, true)
      : await this.findElement(selector);

    if (options?.beforeClick) {
      await options.beforeClick();
    }

    if (options?.clickAfterResponse) {
      // クリックでページが破棄されると sendResponse が届かなくなるため、応答の後にクリックする。
      // クリックできたかはバックグラウンドが chrome.downloads.onCreated で判定する
      window.setTimeout(() => {
        const result = this.clickElementSafely(element, actionName);
        if (!result.success) {
          console.warn(result.error);
        }
      }, 0);

      return { success: true, message: `${actionName}のクリックを開始しました` };
    }

    return this.clickElementSafely(element, actionName);
  }

  /**
   * CSVダウンロードのクリック直前にバックグラウンドへ知らせる
   *
   * バックグラウンドが待ち受けを準備してからクリックすることで、
   * 同時に別のダウンロードが始まっても取り違えないようにする
   */
  private async notifyDownloadWillStart(): Promise<void> {
    try {
      await withTimeout(
        Promise.resolve(chrome.runtime.sendMessage({ action: 'csv-download-will-start' })),
        this.notifyTimeout,
        'ダウンロード開始の通知がタイムアウトしました'
      );
    } catch {
      // 通知できなくてもクリックは続行する（取得は失敗する）
    }
  }

  /**
   * 要素を検索（無ければ出現を監視してタイムアウトまで待つ）
   */
  private async findElement(
    selectorGroup: string,
    timeout: number = this.elementTimeout,
    requireInteractable: boolean = false
  ): Promise<Element> {
    const selectors = selectorGroup.split(',').map(s => s.trim());

    // 不正セレクターは querySelector の例外をそのまま呼び出し元へ伝える。
    // 初回チェックを通過した時点でセレクターは有効と分かるため、
    // 監視側では例外処理を持たない。
    const findMatching = (): { element: Element; selector: string } | null => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && (!requireInteractable || DomUtils.isElementInteractable(element))) {
          return { element, selector };
        }
      }
      return null;
    };

    // 既存要素をチェック
    const existing = findMatching();
    if (existing) {
      console.log(`既存要素が見つかりました: ${existing.selector}`);
      return existing.element;
    }

    // MutationObserverで要素の出現を待機
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const found = findMatching();
        if (found) {
          observer.disconnect();
          clearTimeout(timeoutId);
          console.log(`動的に要素が見つかりました: ${found.selector}`);
          resolve(found.element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });

      const timeoutId = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素が見つかりませんでした: ${selectorGroup} (${timeout}ms)`));
      }, timeout);
    });
  }

  /**
   * 要素を安全にクリック
   */
  private clickElementSafely(element: Element | null, actionName: string): DownloadResponse {
    if (!element) {
      return { 
        success: false, 
        error: `${actionName}の要素が見つかりません` 
      };
    }

    console.log(`${actionName}を実行中...`, element);

    if (DomUtils.safeClick(element)) {
      return { 
        success: true, 
        message: `${actionName}が完了しました` 
      };
    } else {
      return { 
        success: false, 
        error: `${actionName}のクリックに失敗しました` 
      };
    }
  }

  /**
   * ページ準備完了をバックグラウンドに通知
   */
  private notifyPageReady(): void {
    try {
      const pageReadyMessage: PageReadyMessage = {
        action: 'page-ready',
        url: window.location.href
      };

      chrome.runtime.sendMessage(pageReadyMessage, (response) => {
        if (!chrome.runtime.lastError) {
          console.log('ページ準備完了を通知しました:', response);
        }
      });
    } catch (error) {
      console.warn('ページ準備完了通知でエラー:', error);
    }
  }
}

/**
 * ページ読み込み完了時の処理
 */
function initializeExtension(): void {
  console.log('楽天証券CSV拡張機能の初期化を開始します');
  
  if (RakutenUtils.isRakutenSecurities(window.location.href)) {
    RakutenCsvExtension.getInstance();
  } else {
    console.log('楽天証券のサイトではないため、拡張機能を初期化しません');
  }
}

// DOM読み込み完了時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// CRXjsビルド用のエクスポート関数
export function onExecute(): void {
  if (RakutenUtils.isRakutenSecurities(window.location.href)) {
    console.log('楽天証券CSV拡張機能をonExecuteで開始');
    RakutenCsvExtension.getInstance();
  }
}

// テスト用にクラスをエクスポート
export { RakutenCsvExtension };

// スクリプト読み込み完了のログ
console.log('楽天証券CSV拡張機能のコンテンツスクリプトが読み込まれました');
