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

/**
 * ページ遷移の待ち受け
 *
 * 遷移が始まったかどうかを呼び出し側から確認できるようにする。遷移を伴わない
 * ステップ（画面内の更新だけ）で上限時間まで待たないため。
 */
interface PageTransitionWait {
  readonly done: Promise<void>;
  readonly hasStarted: () => boolean;
  readonly cancel: () => void;
}

export class DownloadStepExecutor {
  private readonly config = {
    maxRetries: 2,
    stepTimeout: 30000,
    retryInterval: 300
  };

  /** ページ遷移完了イベントを取りこぼした場合のハング防止タイムアウト */
  private readonly pageTransitionTimeout = 3000;

  /** 遷移が始まるかを見極める猶予。遷移しないステップで上限時間まで待たないための短い待ち */
  private readonly pageTransitionSettleTime = 300;

  /**
   * download-csvクリック後、chrome.downloads.onCreatedを取りこぼした場合や
   * downloads APIが使えない場合のハング防止タイムアウト
   */
  private readonly downloadStartTimeout = 5000;

  /** page-ready通知を待っているtabIdごとのコールバック集合 */
  private readonly pageReadyWaiters: Map<number, Set<() => void>> = new Map();

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

      // クリック直後に発火するページ遷移完了イベントを取りこぼさないよう、
      // executeSteps呼び出し前（クリック前）に待ち受けを準備しておく。
      const pageTransition = group.kind === 'page-transition'
        ? this.waitForPageTransition(tabId, this.pageTransitionTimeout)
        : null;

      const outcome = await this.executeStepsWithRetry(
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

      if (pageTransition) {
        await this.settlePageTransition(pageTransition);
      }
      this.reportStepTiming(reportStep, steps, outcome);
      await outcome.downloadStart;
    }

    return {
      success: true,
      message: `${description}のCSVダウンロードが完了しました`
    };
  }

  /**
   * 同一ページ内の連続ステップをリトライ付きで実行
   *
   * 送り直すのは応答が届かなかった場合だけにする。contentが確定させた
   * 失敗（要素未検出など）を送り直すと済んだクリックを繰り返すため。
   */
  private async executeStepsWithRetry(
    tabId: number,
    steps: readonly CsvDownloadStep[],
    selectors: CsvDownloadConfig['selectors'],
    captureDownloadStart: boolean | undefined,
    waitForDownloadStart: boolean
  ): Promise<StepExecutionOutcome> {
    let lastError: string = '';
    let lastStep: CsvDownloadStep | undefined;
    let lastCode: string | undefined;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // ダウンロード開始はクリック前から待ち受ける必要があるため、
      // リトライのたびにクリック前に待ち受けを張り直す
      const downloadStart = waitForDownloadStart
        ? this.waitForDownloadStart(this.downloadStartTimeout)
        : undefined;

      try {
        const attemptStart = Date.now();
        const sendStartedAt = Date.now();
        attempts += 1;
        let result = await this.executeSteps(tabId, steps, selectors, captureDownloadStart);
        const actionCompletedAt = Date.now();

        if (result.success) {
          let clickResult: { readonly clickedAt: number; readonly durationMs?: number } | undefined;
          if (waitForDownloadStart && steps.includes('download-csv')) {
            clickResult = await this.waitForDownloadClick(tabId, this.downloadStartTimeout);
          }
          const started = !downloadStart || await this.isDownloadStarted(downloadStart);
          if (started) {
            return {
              response: result,
              downloadStart,
              timing: {
                startedAt: attemptStart,
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
          result = {
            success: false,
            error: 'ダウンロード開始を確認できませんでした',
            step: 'download-csv'
          };
        }

        // コンテンツスクリプト不在エラーはリトライしない（再読み込み済みで失敗しているため）
        if (result.code === 'content-script-missing') {
          lastError = result.error || 'コンテンツスクリプトが見つかりません';
          lastStep = result.step;
          lastCode = result.code;
          break;
        }

        // クリック後のページ破棄で応答だけが失われても、ダウンロードが始まっていれば
        // 取得は成立している。再クリックすると二重ダウンロードになるため打ち切る。
        // コンテンツスクリプトが返した失敗（要素未検出など）は成功にしない
        if (result.communicationFailed && (await this.isDownloadStarted(downloadStart))) {
          return { response: { success: true, message: 'ダウンロードの開始を確認しました' }, downloadStart };
        }

        // contentが確定させた失敗は送り直さない。済んだクリックの繰り返しは二重ダウンロードの危険がある
        if (!result.communicationFailed) {
          lastError = result.error || 'ステップの実行に失敗しました';
          lastStep = result.step;
          break;
        }

        lastError = result.error || 'ステップの実行に失敗しました';
        lastStep = result.step;

        if (attempt < this.config.maxRetries) {
          await sleep(this.config.retryInterval);
        }
      } catch (error) {
        if (await this.isDownloadStarted(downloadStart)) {
          return { response: { success: true, message: 'ダウンロードの開始を確認しました' }, downloadStart };
        }

        lastError = error instanceof Error ? error.message : 'ステップ実行中にエラーが発生しました';

        if (attempt < this.config.maxRetries) {
          await sleep(this.config.retryInterval);
        }
      }
    }

    return {
      response: {
        success: false,
        error: `ステップ群 ${steps.join(', ')} の実行に失敗しました（${attempts}回試行）: ${lastError}`,
        step: lastStep,
        code: lastCode
      }
    };
  }

  /**
   * ステップごとの所要時間を報告する
   *
   * ページ遷移を伴うステップは遷移完了までを、ダウンロードのステップは押下までと
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

      // content script 受信後、CSV保存ボタンが見つかるまで
      // content script 側で計測した内訳をそのまま報告する
      for (const contentTiming of timing.contentTimings ?? []) {
        reportStep({ step, phase: contentTiming.phase, durationMs: contentTiming.durationMs });
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

  /**
   * 同一ページ内の連続ステップの実行
   *
   * コンテンツスクリプトが見つからない場合（Receiving end does not exist）は、
   * タブを再読み込みして1回だけやり直す。
   */
  private executeSteps(
    tabId: number,
    steps: readonly CsvDownloadStep[],
    selectors: CsvDownloadConfig['selectors'],
    captureDownloadStart?: boolean
  ): Promise<StepExecutionResponse> {
    const instruction: CsvDownloadStepsInstruction = {
      action: 'execute-csv-download-steps',
      payload: {
        downloadSteps: steps,
        selectors: selectors,
        captureDownloadStart: captureDownloadStart
      }
    };

    const sendMessageWithRetry = async (retryAfterReload: boolean): Promise<StepExecutionResponse> => {
      return new Promise<StepExecutionResponse>((resolve) => {
        chrome.tabs.sendMessage(tabId, instruction, (response) => {
          if (chrome.runtime.lastError) {
            const errorMessage = chrome.runtime.lastError.message ?? '';
            if (isContentScriptMissingError(errorMessage) && !retryAfterReload) {
              // コンテンツスクリプト不在で、まだ再読み込みしていない場合
              this.reloadTabAndWait(tabId)
                .then(() => sendMessageWithRetry(true))
                .then(resolve)
                .catch((error) => {
                  resolve({
                    success: false,
                    error: `タブの再読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
                    code: 'content-script-missing',
                    communicationFailed: true
                  });
                });
              return;
            }
            // 再読み込み後も失敗、またはその他のエラー
            const isContentScriptMissing = isContentScriptMissingError(errorMessage);
            const errorResponse: StepExecutionResponse = {
              success: false,
              error: `コンテンツスクリプトとの通信に失敗: ${errorMessage}`,
              communicationFailed: true,
              code: isContentScriptMissing ? 'content-script-missing' : undefined
            };
            resolve(errorResponse);
            return;
          }
          resolve(
            response || {
              success: false,
              error: 'レスポンスがありません',
              // 応答が全く届かない場合は送り直しの対象にする
              communicationFailed: true
            }
          );
        });
      });
    };

    const sendMessagePromise = sendMessageWithRetry(false);

    return withTimeout(
      sendMessagePromise,
      this.config.stepTimeout,
      `ステップ群 ${steps.join(', ')} がタイムアウトしました（${this.config.stepTimeout}ms）`
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
   * ページ遷移完了を待つ
   *
   * navigate-to-page/select-tab/display-data のクリックを送る前に呼び出すことで、
   * クリック直後に発火する chrome.tabs.onUpdated の complete イベントや
   * 新しいcontent scriptからのpage-ready通知を取りこぼさずに捕捉する
   * （クリック後に現在の状態を見ると、遷移開始前の古い complete 状態を
   * 誤って「遷移完了」と判定してしまうレースコンディションがあるため、
   * 現在の状態は参照しない）。
   * ページ遷移が発生しない、またはイベントを取りこぼした場合に備えて
   * timeoutMs 経過時にも resolve する。
   */
  private waitForPageTransition(tabId: number, timeoutMs: number): PageTransitionWait {
    let navigationStarted = false;
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    let cleanup: () => void = () => {};
    const wait = createOneShotWait(timeoutMs, () => {
      cleanup();
    });
    const finish = (): void => {
      wait.finish(() => {
        cleanup();
      });
    };
    const onUpdatedListener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo
    ): void => {
      if (updatedTabId !== tabId) {
        return;
      }
      // 遷移が始まった時点では完了を待つ（読み込み中に次のステップを送らない）
      if (changeInfo.status === 'loading') {
        navigationStarted = true;
        return;
      }
      if (changeInfo.status === 'complete') {
        finish();
      }
    };
    cleanup = (): void => {
      chrome.tabs.onUpdated.removeListener(onUpdatedListener);
      this.removePageReadyWaiter(tabId, finish);
      resolveDone();
    };

    chrome.tabs.onUpdated.addListener(onUpdatedListener);
    this.addPageReadyWaiter(tabId, finish);

    return { done, hasStarted: () => navigationStarted, cancel: finish };
  }

  /**
   * ページ遷移の待ち受けを結着させる
   *
   * 遷移が始まっていれば完了まで待ち、始まらなければ短い猶予で次へ進む
   * （画面内の更新だけで終わるステップが上限時間まで待たされるのを避ける）。
   */
  private settlePageTransition(wait: PageTransitionWait): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;

      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      // 遷移が始まっていれば、完了イベント（または上限時間）まで待ち続ける
      const timer = setTimeout(() => {
        if (!wait.hasStarted()) {
          finish();
        }
      }, this.pageTransitionSettleTime);

      void wait.done.then(finish);
    }).then(() => wait.cancel());
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