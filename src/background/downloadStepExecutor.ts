/**
 * CSVダウンロードのステップ実行系
 *
 * backgroundService.ts から分離した責務のひとつ。
 * ステップ列のグルーピング、content script への実行指示、リトライ、
 * ターゲットタブ決定を担う。
 *
 * waitForPageTransition / waitForDownloadStart はクリック直前の待ち受け準備と
 * 実行呼び出しの順序依存（レース回避の核心）があるため、実行ロジックと
 * 同一モジュールに残している。切り離さないこと。
 */

import type {
  CsvDownloadMessage,
  DownloadResponse,
  CsvDownloadConfig,
  CsvDownloadType,
  CsvDownloadStep
} from '../types';
import { RakutenUtils, withTimeout } from '../utils';
import type { TabStateManager } from './tabStateManager';

declare global {
  // UMD グローバル chrome の型拡張には namespace 構文が必須のため、当該ルールのみ除外する
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace chrome {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace tabs {
      /**
       * @types/chrome の tabs.query はコールバック形式のオーバーロードが
       * 最後に宣言されているため、vi.mocked(chrome.tabs.query) の戻り値型解決が
       * void になり mockResolvedValueOnce が型エラーになる。
       * Promise 形式を末尾に追記して型解決を Promise<Tab[]> にする。
       * シグネチャ自体は既存のものと同一であり、ランタイムへの影響はない。
       */
      function query(queryInfo: QueryInfo): Promise<Tab[]>;
    }
  }
}

/**
 * 拡張機能の設定
 */
export interface ExtensionConfig {
  readonly maxRetries: number;
  readonly stepTimeout: number;
  readonly retryInterval: number;
  readonly debugMode: boolean;
}

/**
 * ステップ実行グループ
 *
 * navigate-to-page/select-tab/display-data はページ遷移・ページ更新
 * （content scriptの再読み込み）を伴い得るため単独実行にし、
 * それ以外の同一ページ内のステップは1メッセージにまとめてcontent scriptに渡す。
 *
 * display-dataは「表示する」ボタン押下がフォーム送信/ページ更新を伴う
 * ページがあり、download-csvと同一メッセージに含めるとcontent scriptが
 * sendResponseする前にページが遷移し、message channelが閉じて
 * 「message channel closed before a response was received」で失敗する
 * ことが実機で確認されたため、単独実行対象に含める。
 */
export type StepGroup =
  | { readonly kind: 'page-transition'; readonly step: CsvDownloadStep }
  | { readonly kind: 'batch'; readonly steps: readonly CsvDownloadStep[] };

export class DownloadStepExecutor {
  private readonly config: ExtensionConfig = {
    maxRetries: 2,
    stepTimeout: 30000,
    retryInterval: 1000,
    debugMode: false
  };

  /** ページ遷移・ページ更新を伴い得るステップ（単独実行のうえ遷移完了を待つ対象） */
  private readonly pageTransitionSteps: ReadonlySet<CsvDownloadStep> = new Set([
    'navigate-to-page',
    'select-tab',
    'display-data'
  ]);

  /** ページ遷移完了イベントを取りこぼした場合のハング防止タイムアウト */
  private readonly pageTransitionTimeout = 3000;

  /**
   * download-csvクリック後、chrome.downloads.onCreatedを取りこぼした場合や
   * downloads APIが使えない場合のハング防止タイムアウト
   */
  private readonly downloadStartTimeout = 5000;

  /** page-ready通知を待っているtabIdごとのコールバック集合 */
  private readonly pageReadyWaiters: Map<number, Set<() => void>> = new Map();

  constructor(private readonly stateManager: TabStateManager) {}

  /**
   * 設定を取得（デバッグ用）
   */
  getConfig(): ExtensionConfig {
    return { ...this.config };
  }

  /**
   * CSVダウンロードリクエスト処理
   */
  async executeDownloadRequest(message: CsvDownloadMessage): Promise<DownloadResponse> {
    const { selectedOptions, tabId } = message.payload;

    this.log('CSVダウンロードリクエストを受信:', { selectedOptions, tabId });

    try {
      // タブIDの決定
      const targetTabId = await this.determineTargetTab(tabId);

      // 楽天証券タブの確認
      if (!this.stateManager.hasRakutenTab(targetTabId)) {
        throw new Error('楽天証券のタブではありません');
      }

      // ダウンロード処理を順次実行
      for (const downloadType of selectedOptions) {
        const result = await this.processCsvDownload(targetTabId, downloadType);

        if (!result.success) {
          return result;
        }
      }

      return {
        success: true,
        message: 'すべてのCSVダウンロードが完了しました'
      };

    } catch (error) {
      this.logError('CSVダウンロードリクエスト処理エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
      };
    }
  }

  /**
   * CSVダウンロード処理
   */
  private async processCsvDownload(
    tabId: number,
    downloadType: CsvDownloadType
  ): Promise<DownloadResponse> {
    const config = RakutenUtils.getCsvDownloadConfig(downloadType);

    if (!config) {
      return {
        success: false,
        error: `未対応のダウンロードタイプです: ${downloadType}`
      };
    }

    this.log('ダウンロード設定:', config);

    return this.executeDownloadSequence(tabId, config);
  }

  /**
   * ステップ列を実行単位でグルーピング
   *
   * navigate-to-page/select-tab/display-data はページ遷移やページ更新で
   * content scriptが入れ替わり得るため単独実行にし、それ以外の連続ステップは
   * 同一ページ内のDOM操作としてまとめて1メッセージで実行する。
   */
  groupSteps(steps: readonly CsvDownloadStep[]): readonly StepGroup[] {
    const groups: Array<
      | { kind: 'page-transition'; step: CsvDownloadStep }
      | { kind: 'batch'; steps: CsvDownloadStep[] }
    > = [];

    for (const step of steps) {
      if (this.pageTransitionSteps.has(step)) {
        groups.push({ kind: 'page-transition', step });
        continue;
      }

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.kind === 'batch') {
        lastGroup.steps.push(step);
      } else {
        groups.push({ kind: 'batch', steps: [step] });
      }
    }

    return groups;
  }

  /**
   * ダウンロードシーケンスの実行
   */
  private async executeDownloadSequence(
    tabId: number,
    config: CsvDownloadConfig
  ): Promise<DownloadResponse> {
    const { steps, selectors, description } = config;
    const groups = this.groupSteps(steps);

    for (const group of groups) {
      if (group.kind === 'page-transition') {
        const step = group.step;

        this.log(`ステップ: ${step} を実行中...`);

        // クリック直後に発火するページ遷移完了イベントを取りこぼさないよう、
        // executeStep呼び出し前（クリック前）に待ち受けを準備しておく。
        const pageTransitionPromise = this.waitForPageTransition(tabId, this.pageTransitionTimeout);

        const result = await this.executeStepWithRetry(tabId, step, selectors);

        if (!result.success) {
          return {
            success: false,
            error: `${description}の${step}ステップで失敗: ${result.error}`
          };
        }

        await pageTransitionPromise;
      } else {
        this.log(`ステップ群: ${group.steps.join(', ')} を実行中...`);

        // download-csvを含む場合、クリック直後に発火するdownloads.onCreatedを
        // 取りこぼさないよう、executeSteps呼び出し前（クリック前）に
        // ダウンロード開始の待ち受けを準備しておく。
        const includesDownloadCsv = group.steps.includes('download-csv');
        const downloadStartPromise = includesDownloadCsv
          ? this.waitForDownloadStart(this.downloadStartTimeout)
          : null;

        const result = await this.executeStepsWithRetry(tabId, group.steps, selectors);

        if (!result.success) {
          const failedStep = result.step ?? group.steps[group.steps.length - 1];
          return {
            success: false,
            error: `${description}の${failedStep}ステップで失敗: ${result.error}`
          };
        }

        if (downloadStartPromise) {
          await downloadStartPromise;
        }
      }
    }

    return {
      success: true,
      message: `${description}のCSVダウンロードが完了しました`
    };
  }

  /**
   * ステップをリトライ付きで実行
   */
  private async executeStepWithRetry(
    tabId: number,
    step: CsvDownloadStep,
    selectors: CsvDownloadConfig['selectors']
  ): Promise<DownloadResponse> {
    let lastError: string = '';

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeStep(tabId, step, selectors);

        if (result.success) {
          return result;
        }

        lastError = result.error || 'ステップの実行に失敗しました';

        if (attempt < this.config.maxRetries) {
          this.log(`ステップ ${step} をリトライします (${attempt + 1}/${this.config.maxRetries})`);
          await this.sleep(this.config.retryInterval);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'ステップ実行中にエラーが発生しました';

        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryInterval);
        }
      }
    }

    return {
      success: false,
      error: `ステップ ${step} の実行に失敗しました（${this.config.maxRetries + 1}回試行）: ${lastError}`
    };
  }

  /**
   * 単一ステップの実行
   */
  private executeStep(
    tabId: number,
    step: CsvDownloadStep,
    selectors: CsvDownloadConfig['selectors']
  ): Promise<DownloadResponse> {
    const sendMessagePromise = new Promise<DownloadResponse>((resolve) => {
      chrome.tabs.sendMessage(tabId, {
        action: 'execute-csv-download',
        payload: {
          downloadStep: step,
          selectors: selectors
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: `コンテンツスクリプトとの通信に失敗: ${chrome.runtime.lastError.message}`
          });
        } else {
          resolve(response || { success: false, error: 'レスポンスがありません' });
        }
      });
    });

    return withTimeout(
      sendMessagePromise,
      this.config.stepTimeout,
      `ステップ ${step} がタイムアウトしました（${this.config.stepTimeout}ms）`
    );
  }

  /**
   * 同一ページ内の連続ステップをリトライ付きで実行
   */
  private async executeStepsWithRetry(
    tabId: number,
    steps: readonly CsvDownloadStep[],
    selectors: CsvDownloadConfig['selectors']
  ): Promise<DownloadResponse> {
    let lastError: string = '';
    let lastStep: CsvDownloadStep | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.executeSteps(tabId, steps, selectors);

        if (result.success) {
          return result;
        }

        lastError = result.error || 'ステップの実行に失敗しました';
        lastStep = result.step;

        if (attempt < this.config.maxRetries) {
          this.log(`ステップ群 ${steps.join(', ')} をリトライします (${attempt + 1}/${this.config.maxRetries})`);
          await this.sleep(this.config.retryInterval);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'ステップ実行中にエラーが発生しました';

        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryInterval);
        }
      }
    }

    return {
      success: false,
      error: `ステップ群 ${steps.join(', ')} の実行に失敗しました（${this.config.maxRetries + 1}回試行）: ${lastError}`,
      step: lastStep
    };
  }

  /**
   * 同一ページ内の連続ステップの実行
   */
  private executeSteps(
    tabId: number,
    steps: readonly CsvDownloadStep[],
    selectors: CsvDownloadConfig['selectors']
  ): Promise<DownloadResponse> {
    const sendMessagePromise = new Promise<DownloadResponse>((resolve) => {
      chrome.tabs.sendMessage(tabId, {
        action: 'execute-csv-download-steps',
        payload: {
          downloadSteps: steps,
          selectors: selectors
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: `コンテンツスクリプトとの通信に失敗: ${chrome.runtime.lastError.message}`
          });
        } else {
          resolve(response || { success: false, error: 'レスポンスがありません' });
        }
      });
    });

    return withTimeout(
      sendMessagePromise,
      this.config.stepTimeout,
      `ステップ群 ${steps.join(', ')} がタイムアウトしました（${this.config.stepTimeout}ms）`
    );
  }

  /**
   * ターゲットタブIDを決定
   */
  private async determineTargetTab(tabId?: number): Promise<number> {
    if (tabId) {
      return tabId;
    }

    const activeTabId = this.stateManager.getActiveTabId();
    if (activeTabId) {
      return activeTabId;
    }

    // アクティブタブを取得
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id) {
      throw new Error('ターゲットタブが見つかりません');
    }

    return activeTab.id;
  }

  /**
   * 待機
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ページ遷移完了を待つ
   *
   * navigate-to-page/select-tab のクリックを送る前に呼び出すことで、
   * クリック直後に発火する chrome.tabs.onUpdated の complete イベントや
   * 新しいcontent scriptからのpage-ready通知を取りこぼさずに捕捉する
   * （クリック後に現在の状態を見ると、遷移開始前の古い complete 状態を
   * 誤って「遷移完了」と判定してしまうレースコンディションがあるため、
   * 現在の状態は参照しない）。
   * ページ遷移が発生しない、またはイベントを取りこぼした場合に備えて
   * timeoutMs 経過時にも resolve する。
   */
  private waitForPageTransition(tabId: number, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
        this.removePageReadyWaiter(tabId, finish);
        clearTimeout(timer);
        resolve();
      };

      const onUpdatedListener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo
      ): void => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          finish();
        }
      };

      chrome.tabs.onUpdated.addListener(onUpdatedListener);
      this.addPageReadyWaiter(tabId, finish);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  /**
   * ダウンロード開始を待つ
   *
   * download-csvのクリックを送る前に呼び出すことで、クリック直後に発火する
   * chrome.downloads.onCreated を取りこぼさずに捕捉する。これにより、
   * ブラウザ側でダウンロードが開始として確定する前に次のdownloadTypeの
   * navigate-to-pageへ進んでページ遷移し、直前のダウンロードがキャンセルされる
   * 事象を防ぐ。downloads APIが使えない場合や、イベントを取りこぼした場合に
   * 備えて timeoutMs 経過時にも resolve する（ハング防止）。
   */
  private waitForDownloadStart(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!chrome.downloads?.onCreated) {
        resolve();
        return;
      }

      let settled = false;

      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        chrome.downloads.onCreated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      };

      const listener = (): void => {
        finish();
      };

      chrome.downloads.onCreated.addListener(listener);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  /**
   * page-ready待ちのコールバックを登録
   */
  private addPageReadyWaiter(tabId: number, callback: () => void): void {
    const waiters = this.pageReadyWaiters.get(tabId) ?? new Set<() => void>();
    waiters.add(callback);
    this.pageReadyWaiters.set(tabId, waiters);
  }

  /**
   * page-ready待ちのコールバックを解除
   */
  private removePageReadyWaiter(tabId: number, callback: () => void): void {
    const waiters = this.pageReadyWaiters.get(tabId);
    if (!waiters) {
      return;
    }
    waiters.delete(callback);
    if (waiters.size === 0) {
      this.pageReadyWaiters.delete(tabId);
    }
  }

  /**
   * page-ready待ちのコールバックへ通知
   */
  resolvePageReadyWaiters(tabId: number): void {
    const waiters = this.pageReadyWaiters.get(tabId);
    if (!waiters) {
      return;
    }
    // finish()内でwaiters.deleteが呼ばれるため、コピーしてから反復する
    Array.from(waiters).forEach(callback => callback());
  }

  /**
   * ログ出力
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.config.debugMode) {
      console.log(`[RakutenCSV] ${message}`, ...args);
    }
  }

  /**
   * エラーログ出力
   */
  private logError(message: string, error: unknown): void {
    console.error(`[RakutenCSV Error] ${message}`, error);
  }
}
