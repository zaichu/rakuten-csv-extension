import type {
  CheckCsvDownloadStepInstruction,
  CsvDownloadStepsInstruction,
  ContentScriptMessage,
  ContentScriptResponse,
  DownloadResponse,
  DownloadStepTiming,
  LoginStateResponse,
  PageReadyMessage,
  ChromeMessage,
  CsvDownloadStep,
  CsvSelectors
} from '../types';
import { RakutenUtils, DomUtils, sleep, withTimeout } from '../utils';

/**
 * 楽天証券 CSV拡張機能のコンテンツスクリプト
 * シングルトンパターンで実装し、メッセージリスナーを管理
 */
class RakutenCsvExtension {
  private static instance: RakutenCsvExtension | null = null;
  // 送り直しをしない分、1回の試行で従来の合計（約15秒）まで待つ
  private readonly elementTimeout = 15000;
  private readonly elementPollInterval = 50;
  private readonly notifyTimeout = 2000;

  /** このページでログイン画面を検出済みか */
  private loginScreenDetected = false;
  /** パスキーボタンを押下済みか */
  private passkeyLoginClicked = false;

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

        // メッセージを受け取った時点を計測の起点にする（サイト検証より前）
        const receivedAt = Date.now();

        // 非同期処理を適切に処理
        this.handleMessage(message, receivedAt)
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
  private async handleMessage(
    message: ContentScriptMessage,
    receivedAt: number = Date.now()
  ): Promise<ContentScriptResponse> {
    switch (message.action) {
      case 'execute-csv-download-steps':
        return this.handleCsvDownloadStepsExecution(message, receivedAt);

      case 'check-csv-download-step':
        return this.checkCsvDownloadStep(message);

      case 'check-login-state':
        return this.handleCheckLoginState();

      case 'extension-updated':
        this.handleExtensionUpdate();
        return { success: true, message: '拡張機能が更新されました' };

      case 'check-connection':
        return { success: true };

      default:
        return {
          success: false,
          error: `未対応のアクション: ${(message as ChromeMessage).action}`
        };
    }
  }

  private checkCsvDownloadStep(message: CheckCsvDownloadStepInstruction): DownloadResponse {
    const { step, selectors } = message.payload;
    const selector = {
      'navigate-to-page': selectors.menuLink,
      'select-tab': selectors.tabSelector,
      'select-period': selectors.periodRadio,
      'display-data': selectors.displayButton,
      'download-csv': selectors.csvButton
    }[step];
    const requireInteractable = step === 'display-data' || step === 'download-csv';
    const found = Boolean(selector && selector.split(',').some(candidate => {
      const element = document.querySelector(candidate.trim());
      return element && (!requireInteractable || DomUtils.isElementInteractable(element));
    }));
    return { success: found };
  }

  /**
   * ログイン状態の確認
   *
   * 氏名や口座番号などの個人情報は読まず、ログイン画面かどうかだけを見る
   */
  private handleCheckLoginState(): LoginStateResponse {
    const loggedIn = !this.isLoginScreen();

    // 取得フローのログイン待ちは最初の検出直後にページを開き直すため、
    // 読み込み直し前のページで押すとクリックが無駄になる。
    // 同じページで2回検出してから押すことで、開き直した側だけに絞る
    if (!loggedIn) {
      if (this.loginScreenDetected) {
        this.clickPasskeyLoginButtonOnce();
      }
      this.loginScreenDetected = true;
    }

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
    this.clickElementSafely(button, 'パスキーログイン', 'button#login-passkey');
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
    message: CsvDownloadStepsInstruction,
    receivedAt: number = Date.now()
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

    const contentTimings: DownloadStepTiming[] = [];

    for (const step of downloadSteps) {
      try {
        const result = await this.executeDownloadStep(step, selectors, captureDownloadStart);
        console.log(`ステップ ${step} 完了:`, result);

        if (result.contentTimings) {
          contentTimings.push(...result.contentTimings);
        }

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
      message: 'ステップ群の実行が完了しました',
      receivedAt,
      contentTimings: contentTimings.length > 0 ? contentTimings : undefined,
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
    // content script がメッセージを受け取った時刻（service worker 側で送信からの時間を計算する）
    const receivedAt = Date.now();

    if (!selector) {
      return { success: false, error: `${actionName}のセレクターが指定されていません` };
    }

    const element = options?.requireInteractable
      ? await this.findElement(selector, this.elementTimeout, true)
      : await this.findElement(selector);

    const buttonFoundAt = Date.now();

    if (options?.beforeClick) {
      await options.beforeClick();
    }

    if (options?.clickAfterResponse) {
      const buttonFoundDurationMs = Math.max(0, buttonFoundAt - receivedAt);
      // クリックでページが破棄されると sendResponse が届かなくなるため、応答の後にクリックする。
      // クリックできたかはバックグラウンドが chrome.downloads.onCreated で判定する
      window.setTimeout(() => {
        const clickDurationMs = Math.max(0, Date.now() - buttonFoundAt);
        // 実クリック直前の時点を service worker へ伝え、click→download-start の起点にする
        try {
          chrome.runtime.sendMessage(
            { action: 'csv-download-clicked', clickDurationMs },
            () => {
              void chrome.runtime.lastError;
            }
          );
        } catch {
          // 通知できなくてもクリックは続行する
        }
        const result = this.clickElementSafely(element, actionName, selector);
        if (!result.success) {
          console.warn(result.error);
        }
      }, 0);

      return {
        success: true,
        message: `${actionName}のクリックを開始しました`,
        receivedAt,
        contentTimings: [{ phase: 'button-found', durationMs: buttonFoundDurationMs }],
      };
    }

    return this.clickElementSafely(element, actionName, selector);
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
   * 要素を検索（無ければ短い間隔で探し直してタイムアウトまで待つ）
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

    // DOMの変化を待つ方式だと、変化を伴わずに押せるようになった要素（画像の読み込み後に
    // 大きさが付いた等）を見逃して上限時間まで待つ。短い間隔で探し直し、押せるように
    // なった時点で押す
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await sleep(this.elementPollInterval);
      const found = findMatching();
      if (found) {
        console.log(`動的に要素が見つかりました: ${found.selector}`);
        return found.element;
      }
    }

    throw new Error(`要素が見つかりませんでした: ${selectorGroup} (${timeout}ms)`);
  }

  /**
   * 要素を安全にクリック
   */
  private clickElementSafely(element: Element | null, actionName: string, selector?: string): DownloadResponse {
    if (!element) {
      return { 
        success: false, 
        error: `${actionName}の要素が見つかりません` 
      };
    }

    console.log(`${actionName}を実行中: ${selector ?? actionName}`);

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

// スクリプト読み込み完了のログ
console.log('楽天証券CSV拡張機能のコンテンツスクリプトが読み込まれました');
