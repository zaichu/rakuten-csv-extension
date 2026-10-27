import type {
  CheckCsvDownloadStepInstruction,
  CsvDownloadMessage,
  CsvDownloadStepsInstruction,
  DownloadResponse,
  DownloadStepTiming,
  CsvDownloadConfig,
  CsvDownloadType,
  CsvDownloadStep
} from '../types';
import { isPageTransitionStep } from '../types';
import { RakutenUtils, withTimeout, sleep, createOneShotWait } from '../utils';
import { isRakutenDownloadSource } from './downloadedFile';

/** コンテンツスクリプト不在エラーの判定用 */
const CONTENT_SCRIPT_MISSING_ERRORS = [
  'Receiving end does not exist',
  'Could not establish connection. Receiving end does not exist'
] as const;

/** コンテンツスクリプト不在エラーかどうか判定 */
function isContentScriptMissingError(message: string): boolean {
  return CONTENT_SCRIPT_MISSING_ERRORS.some(e => message.includes(e));
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

/** コンテンツスクリプトとの通信が切れて応答を受け取れなかった失敗 */
type StepExecutionResponse = DownloadResponse & { readonly communicationFailed?: boolean };

/**
 * ステップごとの所要時間
 *
 * content側の計測値に実行ステップを添えたもの。
 */
export type StepTiming = DownloadStepTiming & { readonly step: CsvDownloadStep };

export type StepTimingReporter = (timing: StepTiming) => void;

/** 成功した実行の計測時刻 */
interface StepExecutionTiming {
  readonly startedAt: number;
  readonly sendStartedAt: number;
  readonly actionCompletedAt: number;
  readonly receivedAt?: number;
  readonly contentTimings?: readonly DownloadStepTiming[];
  readonly clickStartedAt?: number;
  readonly clickDurationMs?: number;
  readonly downloadStartedAt?: number;
}

/** ステップ群の実行結果と、クリック前に待ち受けたダウンロード開始の待ち受け */
interface StepExecutionOutcome {
  readonly response: DownloadResponse;
  readonly downloadStart?: Promise<boolean>;
  readonly timing?: StepExecutionTiming;
}

export class DownloadStepExecutor {
  private readonly stepTimeout = 30000;
  private readonly elementPollInterval = 100;

  /**
   * download-csvクリック後、chrome.downloads.onCreatedを取りこぼした場合や
   * downloads APIが使えない場合のハング防止タイムアウト
   */
  private readonly downloadStartTimeout = 5000;

  /** 実クリック直前通知を待っているtabIdごとのコールバック集合 */
  private readonly downloadClickWaiters: Map<
    number,
    Set<(clickDurationMs: number | undefined, clickedAt: number) => void>
  > = new Map();

  /** 待ち登録前に届いた実クリック通知を一時保持する */
  private readonly pendingDownloadClicks: Map<
    number,
    { readonly clickedAt: number; readonly durationMs?: number }
  > = new Map();

  constructor(
    private readonly tabState: {
      hasRakutenTab(tabId: number): boolean;
      getActiveTabId(): number | undefined;
    }
  ) {}

  /**
   * CSVダウンロードリクエスト処理
   *
   * reportStep を渡すと、ステップごとの所要時間を実行のたびに受け取れる
   */
  async executeDownloadRequest(
    message: CsvDownloadMessage,
    reportStep?: StepTimingReporter
  ): Promise<DownloadResponse> {
    const { selectedOptions, tabId, captureDownloadStart } = message.payload;

    try {
      // タブIDの決定
      const targetTabId = await this.determineTargetTab(tabId);

      // 楽天証券タブの確認
      if (!this.tabState.hasRakutenTab(targetTabId)) {
        throw new Error('楽天証券のタブではありません');
      }

      // コンテンツスクリプトへの疎通確認
      const connected = await this.checkContentScriptConnection(targetTabId);
      if (!connected) {
        await this.reloadTabAndWait(targetTabId);
        // 再読み込み後、再度疎通確認
        const reconnected = await this.checkContentScriptConnection(targetTabId);
        if (!reconnected) {
          return {
            success: false,
            error: '楽天証券のタブを再読み込みしてください',
            code: 'content-script-missing'
          };
        }
      }

      // ダウンロード処理を順次実行
      for (const downloadType of selectedOptions) {
        const result = await this.processCsvDownload(
          targetTabId,
          downloadType,
          captureDownloadStart,
          reportStep
        );

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
    downloadType: CsvDownloadType,
    captureDownloadStart?: boolean,
    reportStep?: StepTimingReporter
  ): Promise<DownloadResponse> {
    const config = RakutenUtils.getCsvDownloadConfig(downloadType);

    if (!config) {
      return {
        success: false,
        error: `未対応のダウンロードタイプです: ${downloadType}`
      };
    }

    return this.executeDownloadSequence(tabId, config, captureDownloadStart, reportStep);
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
      if (isPageTransitionStep(step)) {
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
    config: CsvDownloadConfig,
    captureDownloadStart?: boolean,
    reportStep?: StepTimingReporter
  ): Promise<DownloadResponse> {
    const { steps, selectors, description } = config;
    const groups = this.groupSteps(steps);

    for (const group of groups) {
      const steps: readonly CsvDownloadStep[] =
        group.kind === 'page-transition' ? [group.step] : group.steps;

      const outcome = await this.executeStepsOnce(
        tabId,
        steps,
        selectors,
        captureDownloadStart,
        group.kind === 'batch' && group.steps.includes('download-csv')
      );
      const result = outcome.response;

      if (!result.success) {
        const failedStep = result.step ?? steps[steps.length - 1];
        return {
          success: false,
          error: `${description}の${failedStep}ステップで失敗: ${result.error}`,
          code: result.code
        };
      }

      this.reportStepTiming(reportStep, steps, outcome);
      await outcome.downloadStart;
    }

    return {
      success: true,
      message: `${description}のCSVダウンロードが完了しました`
    };
  }

  private async executeStepsOnce(
    tabId: number,
    steps: readonly CsvDownloadStep[],
    selectors: CsvDownloadConfig['selectors'],
    captureDownloadStart: boolean | undefined,
    waitForDownloadStart: boolean
  ): Promise<StepExecutionOutcome> {
    const startedAt = Date.now();
    const deadline = startedAt + this.stepTimeout;
    if (!await this.waitForStepElement(tabId, steps[0], selectors, deadline)) {
      return {
        response: {
          success: false,
          error: `ステップ ${steps[0]} の要素待ちがタイムアウトしました（${this.stepTimeout}ms）`,
          step: steps[0]
        }
      };
    }

    const downloadStart = waitForDownloadStart
      ? this.waitForDownloadStart(this.downloadStartTimeout)
      : undefined;
    try {
      const sendStartedAt = Date.now();
      const result = await this.executeSteps(
        tabId, steps, selectors, deadline - sendStartedAt, captureDownloadStart
      );
      const actionCompletedAt = Date.now();
      if (result.success) {
        const clickResult = waitForDownloadStart && steps.includes('download-csv')
          ? await this.waitForDownloadClick(tabId, this.downloadStartTimeout)
          : undefined;
        if (!downloadStart || await this.isDownloadStarted(downloadStart)) {
          return {
            response: result,
            downloadStart,
            timing: {
              startedAt,
              sendStartedAt,
              actionCompletedAt,
              receivedAt: result.receivedAt,
              contentTimings: result.contentTimings,
              clickStartedAt: clickResult?.clickedAt,
              clickDurationMs: clickResult?.durationMs,
              downloadStartedAt: downloadStart ? Date.now() : undefined
            }
          };
        }
        return { response: { success: false, error: 'ダウンロード開始を確認できませんでした', step: 'download-csv' } };
      }

      if (result.code === 'content-script-missing') {
        return { response: result };
      }

      // クリック後の通信切れでも開始を観測済みなら、再クリックせず成功とする。
      // content が確定させた失敗は成功にしない。
      if (result.communicationFailed && await this.isDownloadStarted(downloadStart)) {
        return { response: { success: true, message: 'ダウンロードの開始を確認しました' }, downloadStart };
      }
      return { response: result };
    } catch (error) {
      if (await this.isDownloadStarted(downloadStart)) {
        return { response: { success: true, message: 'ダウンロードの開始を確認しました' }, downloadStart };
      }
      return {
        response: {
          success: false,
          error: error instanceof Error ? error.message : 'ステップ実行中にエラーが発生しました'
        }
      };
    }
  }

  private async waitForStepElement(
    tabId: number,
    step: CsvDownloadStep,
    selectors: CsvDownloadConfig['selectors'],
    deadline: number
  ): Promise<boolean> {
    const instruction: CheckCsvDownloadStepInstruction = {
      action: 'check-csv-download-step',
      payload: { step, selectors }
    };
    while (Date.now() < deadline) {
      const pollStartedAt = Date.now();
      try {
        const found = await withTimeout(
          new Promise<boolean>(resolve => {
            chrome.tabs.sendMessage(tabId, instruction, (response: DownloadResponse | undefined) => {
              resolve(!chrome.runtime.lastError && response?.success === true);
            });
          }),
          Math.min(this.elementPollInterval, deadline - pollStartedAt),
          '要素の問い合わせに応答がありません'
        );
        if (found && Date.now() < deadline) {
          return true;
        }
      } catch {
        // 遷移で content が不在・無応答の間も、クリックを再送せず要素だけを探す。
      }
      const delay = Math.min(
        this.elementPollInterval - (Date.now() - pollStartedAt),
        deadline - Date.now()
      );
      if (delay > 0) {
        await sleep(delay);
      }
    }
    return false;
  }

  /**
   * ステップごとの所要時間を報告する
   *
   * ダウンロードのステップは押下までと
   * 押下からダウンロード開始までを分けて報告する。
   */
  private reportStepTiming(
    reportStep: StepTimingReporter | undefined,
    steps: readonly CsvDownloadStep[],
    outcome: StepExecutionOutcome
  ): void {
    const timing = outcome.timing;
    if (!reportStep || !timing) {
      return;
    }

    const step = steps[steps.length - 1];

    if (step === 'download-csv') {
      // 送信から content script が受け取るまで
      const receiveDuration =
        timing.receivedAt !== undefined
          ? Math.max(0, timing.receivedAt - timing.sendStartedAt)
          : Math.max(0, timing.actionCompletedAt - timing.sendStartedAt);
      reportStep({ step, phase: 'receive', durationMs: receiveDuration });

      for (const contentTiming of timing.contentTimings ?? []) {
        reportStep({
          step,
          phase: contentTiming.phase,
          durationMs: contentTiming.durationMs + (contentTiming.phase === 'button-found'
            ? Math.max(0, timing.sendStartedAt - timing.startedAt)
            : 0)
        });
      }

      // ボタン発見後、実際にクリックするまで（通知待ちと setTimeout を含む）
      reportStep({
        step,
        phase: 'click',
        durationMs: Math.max(0, timing.clickDurationMs ?? 0)
      });

      // click からダウンロード開始まで
      if (timing.downloadStartedAt !== undefined) {
        const clickStart = timing.clickStartedAt ?? timing.actionCompletedAt;
        reportStep({
          step,
          phase: 'download-start',
          durationMs: Math.max(0, timing.downloadStartedAt - clickStart)
        });
      }
      return;
    }

    reportStep({ step, phase: 'action', durationMs: Math.max(0, timing.actionCompletedAt - timing.startedAt) });

    if (timing.downloadStartedAt !== undefined) {
      reportStep({
        step,
        phase: 'download-start',
        durationMs: Math.max(0, timing.downloadStartedAt - timing.actionCompletedAt)
      });
    }
  }

  /**
   * ダウンロード開始を観測できたか
   *
   * 待ち受けが無い場合や、観測できなかった場合（タイムアウト）は false
   */
  private async isDownloadStarted(downloadStart: Promise<boolean> | undefined): Promise<boolean> {
    return downloadStart ? await downloadStart : false;
  }

  private executeSteps(
    tabId: number,
    steps: readonly CsvDownloadStep[],
    selectors: CsvDownloadConfig['selectors'],
    timeoutMs: number,
    captureDownloadStart?: boolean
  ): Promise<StepExecutionResponse> {
    const instruction: CsvDownloadStepsInstruction = {
      action: 'execute-csv-download-steps',
      payload: { downloadSteps: steps, selectors, captureDownloadStart }
    };
    const sendMessagePromise = new Promise<StepExecutionResponse>((resolve) => {
      chrome.tabs.sendMessage(tabId, instruction, (response) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message ?? '';
          resolve({
            success: false,
            error: `コンテンツスクリプトとの通信に失敗: ${errorMessage}`,
            communicationFailed: true,
            code: isContentScriptMissingError(errorMessage) ? 'content-script-missing' : undefined
          });
          return;
        }
        resolve(response || {
          success: false,
          error: 'レスポンスがありません',
          communicationFailed: true
        });
      });
    });
    return withTimeout(
      sendMessagePromise,
      timeoutMs,
      `ステップ群 ${steps.join(', ')} がタイムアウトしました（${this.stepTimeout}ms）`
    );
  }

  /**
   * タブを再読み込みし、完了を待つ
   *
   * コンテンツスクリプトが古いタブに入っていない場合に使用する。
   * status: 'complete' になるまで待機する。
   */
  private async reloadTabAndWait(tabId: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let cleanup: () => void = () => {};
      const wait = createOneShotWait(30000, () => {
        cleanup();
        reject(new Error('タブの再読み込みがタイムアウトしました'));
      });
      const finish = (): void => {
        wait.finish(() => {
          cleanup();
          resolve();
        });
      };
      const onUpdatedListener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo
      ): void => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          finish();
        }
      };
      cleanup = () => {
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
      };

      chrome.tabs.onUpdated.addListener(onUpdatedListener);

      chrome.tabs.reload(tabId);
    });
  }

  /**
   * コンテンツスクリプトへの疎通を確認する
   *
   * 単純なメッセージを送り、応答があるかどうかで判定する。
   * エラーが「Receiving end does not exist」なら false を返す。
   */
  private async checkContentScriptConnection(tabId: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: 'check-connection' }, () => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message ?? '';
          if (isContentScriptMissingError(errorMessage)) {
            resolve(false);
            return;
          }
          // その他のエラーは「接続できたが失敗した」とみなす
          resolve(true);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * ターゲットタブIDを決定
   */
  private async determineTargetTab(tabId?: number): Promise<number> {
    if (tabId) {
      return tabId;
    }

    const activeTabId = this.tabState.getActiveTabId();
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
   * ダウンロード開始を待つ
   *
   * download-csvのクリックを送る前に呼び出すことで、クリック直後に発火する
   * chrome.downloads.onCreated を取りこぼさずに捕捉する。これにより、
   * ブラウザ側でダウンロードが開始として確定する前に次のdownloadTypeの
   * navigate-to-pageへ進んでページ遷移し、直前のダウンロードがキャンセルされる
   * 事象を防ぐ。開始を観測できたら true、downloads APIが使えない場合や
   * イベントを取りこぼした場合は timeoutMs 経過後に false を返す（ハング防止）。
   */
  private waitForDownloadStart(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!chrome.downloads?.onCreated) {
        resolve(false);
        return;
      }

      let cleanup: () => void = () => {};
      const wait = createOneShotWait(timeoutMs, () => {
        cleanup();
        resolve(false);
      });
      const finish = (started: boolean): void => {
        wait.finish(() => {
          cleanup();
          resolve(started);
        });
      };
      const listener = (item: chrome.downloads.DownloadItem): void => {
        // blob: は内側のオリジンまで見る判定を使い、別タブの無関係な
        // blob/data ダウンロードを開始済みと誤認しない
        if (!isRakutenDownloadSource(item.url) && !isRakutenDownloadSource(item.finalUrl)) {
          return;
        }
        finish(true);
      };
      cleanup = () => {
        chrome.downloads.onCreated.removeListener(listener);
      };

      chrome.downloads.onCreated.addListener(listener);
    });
  }

  /**
   * 実クリック直前通知を待つ
   */
  waitForDownloadClick(
    tabId: number,
    timeoutMs: number
  ): Promise<{ readonly clickedAt: number; readonly durationMs?: number } | undefined> {
    const pending = this.pendingDownloadClicks.get(tabId);
    if (pending) {
      this.pendingDownloadClicks.delete(tabId);
      return Promise.resolve(pending);
    }

    return new Promise((resolve) => {
      let callback: (durationMs: number | undefined, clickedAt: number) => void = () => {};
      const removeWaiter = (): void => {
        const waiters = this.downloadClickWaiters.get(tabId);
        if (!waiters) {
          return;
        }
        waiters.delete(callback);
        if (waiters.size === 0) {
          this.downloadClickWaiters.delete(tabId);
        }
      };
      const wait = createOneShotWait(timeoutMs, () => {
        removeWaiter();
        resolve(undefined);
      });
      callback = (durationMs: number | undefined, clickedAt: number): void => {
        wait.finish(() => {
          removeWaiter();
          resolve({ clickedAt, durationMs });
        });
      };

      const waiters = this.downloadClickWaiters.get(tabId) ?? new Set();
      waiters.add(callback);
      this.downloadClickWaiters.set(tabId, waiters);
    });
  }

  /**
   * 実クリック直前通知を受け取る
   */
  notifyDownloadClicked(tabId: number | undefined, clickDurationMs?: number): void {
    if (tabId === undefined) {
      return;
    }
    const waiters = this.downloadClickWaiters.get(tabId);
    const clickedAt = Date.now();
    if (!waiters || waiters.size === 0) {
      this.pendingDownloadClicks.set(tabId, { clickedAt, durationMs: clickDurationMs });
      return;
    }
    Array.from(waiters).forEach((callback) => callback(clickDurationMs, clickedAt));
  }

  /**
   * エラーログ出力
   */
  private logError(message: string, error: unknown): void {
    console.error(`[RakutenCSV Error] ${message}`, error);
  }
}
