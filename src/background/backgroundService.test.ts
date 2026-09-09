import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import type {
  ChromeMessage,
  CsvDownloadMessage,
  CsvDownloadStep,
  CsvDownloadType,
  DownloadResponse,
  ExtensionState,
} from '../types'
import './backgroundService'

/**
 * backgroundService の現状挙動を固定する characterization test。
 * Issue #68 の責務分割リファクタ前後で無変更のまま全件パスすること。
 *
 * backgroundService モジュールは読み込み時にシングルトンを生成して
 * chrome.* にリスナーを登録するため、各リスナーをモックから取り出して
 * 直接呼ぶことで handleMessage / handleTabUpdate / handleTabRemoval
 * 経由の振る舞いを検証する（private メソッドは直接触らない）。
 */

type ExtensionConfigShape = {
  readonly maxRetries: number
  readonly stepTimeout: number
  readonly retryInterval: number
  readonly debugMode: boolean
}

type BackgroundServiceApi = {
  getState(): ExtensionState
  getConfig(): ExtensionConfigShape
  groupSteps: (
    steps: readonly CsvDownloadStep[]
  ) => readonly (
    | { readonly kind: 'page-transition'; readonly step: CsvDownloadStep }
    | { readonly kind: 'batch'; readonly steps: readonly CsvDownloadStep[] }
  )[]
}

function getService(): BackgroundServiceApi {
  const service = (globalThis as unknown as { rakutenCsvService?: BackgroundServiceApi })
    .rakutenCsvService
  if (!service) {
    throw new Error('backgroundService のシングルトンが初期化されていません')
  }
  return service
}

type RuntimeMessageListener = (
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean

type TabUpdatedListener = (
  tabId: number,
  changeInfo: { status?: string },
  tab: { url?: string }
) => void

type TabRemovedListener = (tabId: number) => void

type SendMessageImpl = (
  tabId: number,
  message: { action: string; payload?: Record<string, unknown> },
  callback?: (response: DownloadResponse) => void
) => void

function lastCallArg<T>(mockFn: unknown, index: number): T {
  const mock = mockFn as { mock: { calls: unknown[][] } }
  return mock.mock.calls[mock.mock.calls.length - 1][index] as T
}

function setTabsSendMessageImpl(impl: SendMessageImpl): void {
  const mock = chrome.tabs.sendMessage as unknown as {
    mockImplementation: (fn: SendMessageImpl) => void
  }
  mock.mockImplementation(impl)
}

function senderWithTab(tabId: number): chrome.runtime.MessageSender {
  return { tab: { id: tabId } } as chrome.runtime.MessageSender
}

const RAKUTEN_URL = 'https://www.rakuten-sec.co.jp/web/dividend/'
const OTHER_URL = 'https://example.com/'

describe('backgroundService characterization', () => {
  let runtimeListener: RuntimeMessageListener
  let tabUpdatedListener: TabUpdatedListener
  let tabRemovedListener: TabRemovedListener
  let wiring: Record<string, boolean>

  function sendRuntimeMessage(
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender = {}
  ): Promise<unknown> {
    return new Promise((resolve) => {
      runtimeListener(message, sender, resolve)
    })
  }

  function downloadRequest(
    tabId: number | undefined,
    selectedOptions: readonly CsvDownloadType[]
  ): Promise<unknown> {
    const message: CsvDownloadMessage = {
      action: 'download-csv-request',
      payload: { selectedOptions, tabId },
    }
    return sendRuntimeMessage(message, {})
  }

  /** ページ遷移完了イベントを発火させ、waitForPageTransition の待ちを解消する */
  function firePageTransition(tabId: number): void {
    const addListener = chrome.tabs.onUpdated.addListener as unknown as {
      mock: { calls: unknown[][] }
    }
    for (const call of addListener.mock.calls) {
      const listener = call[0] as TabUpdatedListener
      listener(tabId, { status: 'complete' }, { url: RAKUTEN_URL })
    }
  }

  /** ダウンロード開始イベントを発火させ、waitForDownloadStart の待ちを解消する */
  function fireDownloadCreated(): void {
    const addListener = chrome.downloads.onCreated.addListener as unknown as {
      mock: { calls: unknown[][] }
    }
    for (const call of addListener.mock.calls) {
      const listener = call[0] as () => void
      listener()
    }
  }

  /**
   * content script 側の正常応答をスタブする既定の sendMessage 実装。
   * wait 系の待ち受けが登録される前にイベントを発火させないよう、
   * 呼び出し時点で登録済みのリスナーを同期的に発火させて解消する。
   */
  function stubContentScriptSuccess(tabId: number, action: string, steps: readonly string[]): void {
    if (action === 'execute-csv-download') {
      firePageTransition(tabId)
    } else if (action === 'execute-csv-download-steps' && steps.includes('download-csv')) {
      fireDownloadCreated()
    }
  }

  function cleanupRegisteredTabs(): void {
    const { rakutenTabs } = getService().getState()
    for (const tabId of Array.from(rakutenTabs)) {
      tabRemovedListener(tabId)
    }
  }

  beforeAll(() => {
    // モジュール読み込み時に登録されたリスナーを取り出す
    // （setup.ts の beforeEach が clearAllMocks する前の呼び出し履歴を参照する）
    runtimeListener = lastCallArg<RuntimeMessageListener>(
      chrome.runtime.onMessage.addListener,
      0
    )
    tabUpdatedListener = lastCallArg<TabUpdatedListener>(chrome.tabs.onUpdated.addListener, 0)
    tabRemovedListener = lastCallArg<TabRemovedListener>(chrome.tabs.onRemoved.addListener, 0)
    wiring = {
      onInstalled: (chrome.runtime.onInstalled.addListener as ReturnType<typeof vi.fn>).mock.calls
        .length > 0,
      onStartup: (chrome.runtime.onStartup.addListener as ReturnType<typeof vi.fn>).mock.calls
        .length > 0,
      tabsOnUpdated: (chrome.tabs.onUpdated.addListener as ReturnType<typeof vi.fn>).mock.calls
        .length > 0,
      tabsOnRemoved: (chrome.tabs.onRemoved.addListener as ReturnType<typeof vi.fn>).mock.calls
        .length > 0,
      tabsOnActivated: (chrome.tabs.onActivated.addListener as ReturnType<typeof vi.fn>).mock.calls
        .length > 0,
      actionOnClicked: (chrome.action.onClicked.addListener as ReturnType<typeof vi.fn>).mock.calls
        .length > 0,
      runtimeOnMessage: (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock
        .calls.length > 0,
    }
    expect(runtimeListener).toBeTypeOf('function')
    expect(tabUpdatedListener).toBeTypeOf('function')
    expect(tabRemovedListener).toBeTypeOf('function')
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setTabsSendMessageImpl((tabId, message, callback) => {
      stubContentScriptSuccess(
        tabId,
        message.action,
        (message.payload?.['downloadSteps'] as readonly string[] | undefined) ?? []
      )
      callback?.({ success: true })
    })
  })

  afterEach(() => {
    cleanupRegisteredTabs()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('イベント配線（モジュール読み込み時のリスナー登録）', () => {
    it('必要な chrome イベントにリスナーを登録している', () => {
      expect(wiring).toEqual({
        onInstalled: true,
        onStartup: true,
        tabsOnUpdated: true,
        tabsOnRemoved: true,
        tabsOnActivated: true,
        actionOnClicked: true,
        runtimeOnMessage: true,
      })
    })

    it('既定の設定値を保持している', () => {
      expect(getService().getConfig()).toEqual({
        maxRetries: 2,
        stepTimeout: 30000,
        retryInterval: 1000,
        debugMode: false,
      })
    })
  })

  describe('groupSteps のグルーピングロジック', () => {
    it('navigate-to-page/select-tab/display-data は単独の page-transition グループになる', () => {
      const service = getService()
      expect(service.groupSteps(['navigate-to-page'])).toEqual([
        { kind: 'page-transition', step: 'navigate-to-page' },
      ])
      expect(service.groupSteps(['select-tab'])).toEqual([
        { kind: 'page-transition', step: 'select-tab' },
      ])
      expect(service.groupSteps(['display-data'])).toEqual([
        { kind: 'page-transition', step: 'display-data' },
      ])
    })

    it('それ以外の連続ステップは1つの batch グループにまとまる', () => {
      expect(getService().groupSteps(['select-period', 'download-csv'])).toEqual([
        { kind: 'batch', steps: ['select-period', 'download-csv'] },
      ])
    })

    it('dividend のステップ列は page-transition と batch が交互になる', () => {
      expect(
        getService().groupSteps(['navigate-to-page', 'select-period', 'display-data', 'download-csv'])
      ).toEqual([
        { kind: 'page-transition', step: 'navigate-to-page' },
        { kind: 'batch', steps: ['select-period'] },
        { kind: 'page-transition', step: 'display-data' },
        { kind: 'batch', steps: ['download-csv'] },
      ])
    })

    it('mutualfund のステップ列は select-tab も単独グループになる', () => {
      expect(
        getService().groupSteps([
          'navigate-to-page',
          'select-tab',
          'select-period',
          'display-data',
          'download-csv',
        ])
      ).toEqual([
        { kind: 'page-transition', step: 'navigate-to-page' },
        { kind: 'page-transition', step: 'select-tab' },
        { kind: 'batch', steps: ['select-period'] },
        { kind: 'page-transition', step: 'display-data' },
        { kind: 'batch', steps: ['download-csv'] },
      ])
    })

    it('空のステップ列は空のグループ列になる', () => {
      expect(getService().groupSteps([])).toEqual([])
    })
  })

  describe('メッセージルーティング', () => {
    it('register-rakuten-tab は success を返し送信元タブを登録する', async () => {
      const response = (await sendRuntimeMessage(
        { action: 'register-rakuten-tab' },
        senderWithTab(101)
      )) as { success: boolean }
      expect(response).toEqual({ success: true })
      expect(Array.from(getService().getState().rakutenTabs)).toContain(101)
    })

    it('送信元タブ情報が無くても success を返す', async () => {
      const response = await sendRuntimeMessage({ action: 'register-rakuten-tab' }, {})
      expect(response).toEqual({ success: true })
    })

    it('page-ready は success を返し送信元タブを登録する', async () => {
      const response = (await sendRuntimeMessage(
        { action: 'page-ready' },
        senderWithTab(102)
      )) as { success: boolean }
      expect(response).toEqual({ success: true })
      expect(Array.from(getService().getState().rakutenTabs)).toContain(102)
    })

    it('get-extension-state は success と state を返す', async () => {
      await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(103))
      const response = (await sendRuntimeMessage({ action: 'get-extension-state' }, {})) as {
        success: boolean
        state: ExtensionState
      }
      expect(response.success).toBe(true)
      expect(Array.from(response.state.rakutenTabs)).toContain(103)
      expect(response.state).toHaveProperty('lastActiveTime')
    })

    it('未対応の action はエラーを返す', async () => {
      const response = await sendRuntimeMessage({ action: 'unknown-action' }, {})
      expect(response).toEqual({ success: false, error: '未対応のアクション' })
    })
  })

  describe('download-csv-request の一連の流れ', () => {
    it('対象タブが rakutenTabs に無い場合はエラーになる', async () => {
      const response = await downloadRequest(9999, ['dividend'])
      expect(response).toEqual({ success: false, error: '楽天証券のタブではありません' })
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()
    })

    it('tabId 未指定かつアクティブタブが無い場合はエラーになる', async () => {
      vi.mocked(chrome.tabs.query).mockResolvedValueOnce([])
      const response = await downloadRequest(undefined, ['dividend'])
      expect(response).toEqual({ success: false, error: 'ターゲットタブが見つかりません' })
    })

    it('未対応のダウンロードタイプはエラーになる', async () => {
      await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(111))
      const response = await downloadRequest(111, ['unknown-type' as CsvDownloadType])
      expect(response).toEqual({
        success: false,
        error: '未対応のダウンロードタイプです: unknown-type',
      })
    })

    it('各ステップ成功時は完了メッセージを返しグルーピング通りに content script を呼ぶ', async () => {
      await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(112))
      const response = await downloadRequest(112, ['dividend'])
      expect(response).toEqual({ success: true, message: 'すべてのCSVダウンロードが完了しました' })

      const calls = vi.mocked(chrome.tabs.sendMessage).mock.calls
      expect(calls).toHaveLength(4)
      expect(calls[0][1]).toMatchObject({
        action: 'execute-csv-download',
        payload: { downloadStep: 'navigate-to-page' },
      })
      expect(calls[1][1]).toMatchObject({
        action: 'execute-csv-download-steps',
        payload: { downloadSteps: ['select-period'] },
      })
      expect(calls[2][1]).toMatchObject({
        action: 'execute-csv-download',
        payload: { downloadStep: 'display-data' },
      })
      expect(calls[3][1]).toMatchObject({
        action: 'execute-csv-download-steps',
        payload: { downloadSteps: ['download-csv'] },
      })
    })

    it('途中の単一ステップが失敗した場合はそのステップ名とエラーを含めて返す', async () => {
      await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(113))
      setTabsSendMessageImpl((tabId, message, callback) => {
        if (message.action === 'execute-csv-download') {
          const step = message.payload?.['downloadStep'] as string | undefined
          if (step === 'display-data') {
            callback?.({ success: false, error: '表示ステップ失敗(stub)' })
            return
          }
          firePageTransition(tabId)
          callback?.({ success: true })
          return
        }
        stubContentScriptSuccess(
          tabId,
          message.action,
          (message.payload?.['downloadSteps'] as readonly string[] | undefined) ?? []
        )
        callback?.({ success: true })
      })

      const response = (await downloadRequest(113, ['dividend'])) as DownloadResponse
      expect(response.success).toBe(false)
      expect(response.error).toContain('display-data')
      expect(response.error).toContain('表示ステップ失敗(stub)')
    })

    it('途中のステップ群が失敗した場合は失敗ステップ名を引き継いで返す', async () => {
      await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(114))
      setTabsSendMessageImpl((tabId, message, callback) => {
        if (message.action === 'execute-csv-download-steps') {
          const steps = (message.payload?.['downloadSteps'] as readonly string[] | undefined) ?? []
          if (steps.includes('select-period')) {
            callback?.({ success: false, error: '期間選択失敗(stub)', step: 'select-period' })
            return
          }
        }
        stubContentScriptSuccess(
          tabId,
          message.action,
          (message.payload?.['downloadSteps'] as readonly string[] | undefined) ?? []
        )
        callback?.({ success: true })
      })

      const response = (await downloadRequest(114, ['dividend'])) as DownloadResponse
      expect(response.success).toBe(false)
      expect(response.error).toContain('select-period')
      expect(response.error).toContain('期間選択失敗(stub)')
    })

    it('ステップ失敗時は maxRetries(2) 回までリトライし試行回数を含むエラーになる', async () => {
      await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(115))
      setTabsSendMessageImpl((_tabId, _message, callback) => {
        callback?.({ success: false, error: '常時失敗(stub)' })
      })

      const response = (await downloadRequest(115, ['dividend'])) as DownloadResponse
      expect(response.success).toBe(false)
      // 初回 + リトライ2回 = 3回試行
      expect(response.error).toContain('3回試行')
      expect(vi.mocked(chrome.tabs.sendMessage).mock.calls).toHaveLength(3)
    })
  })

  describe('タブ状態管理', () => {
    it("status complete かつ楽天証券URLでタブが登録される", async () => {
      tabUpdatedListener(301, { status: 'complete' }, { url: RAKUTEN_URL })
      const response = (await sendRuntimeMessage({ action: 'get-extension-state' }, {})) as {
        success: boolean
        state: ExtensionState
      }
      expect(response.success).toBe(true)
      expect(Array.from(response.state.rakutenTabs)).toContain(301)
    })

    it('非楽天証券URLでは登録されない', () => {
      tabUpdatedListener(302, { status: 'complete' }, { url: OTHER_URL })
      expect(Array.from(getService().getState().rakutenTabs)).not.toContain(302)
    })

    it('楽天証券タブが非楽天証券URLに遷移すると登録が削除される', () => {
      tabUpdatedListener(303, { status: 'complete' }, { url: RAKUTEN_URL })
      expect(Array.from(getService().getState().rakutenTabs)).toContain(303)
      tabUpdatedListener(303, { status: 'complete' }, { url: OTHER_URL })
      expect(Array.from(getService().getState().rakutenTabs)).not.toContain(303)
    })

    it('status が complete でない場合は登録されない', () => {
      tabUpdatedListener(304, { status: 'loading' }, { url: RAKUTEN_URL })
      expect(Array.from(getService().getState().rakutenTabs)).not.toContain(304)
    })

    it('onRemoved で登録タブが削除される', () => {
      tabUpdatedListener(305, { status: 'complete' }, { url: RAKUTEN_URL })
      expect(Array.from(getService().getState().rakutenTabs)).toContain(305)
      tabRemovedListener(305)
      expect(Array.from(getService().getState().rakutenTabs)).not.toContain(305)
    })
  })

  describe('タイムアウトフォールバック', () => {
    it('ページ遷移・ダウンロード開始イベントが来なくてもタイムアウトで処理が完了する', async () => {
      vi.useFakeTimers()
      try {
        await sendRuntimeMessage({ action: 'register-rakuten-tab' }, senderWithTab(401))
        // イベントを一切発火させない content script スタブ（成功応答のみ）
        setTabsSendMessageImpl((_tabId, _message, callback) => {
          callback?.({ success: true })
        })

        const pending = downloadRequest(401, ['dividend'])
        // page-transition タイムアウト 3000ms ×2 + download 開始タイムアウト 5000ms を進める
        await vi.advanceTimersByTimeAsync(20000)
        const response = (await pending) as DownloadResponse
        expect(response).toEqual({
          success: true,
          message: 'すべてのCSVダウンロードが完了しました',
        })
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
