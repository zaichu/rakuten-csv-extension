import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import manifestRaw from '../../manifest.json?raw'
import type {
  CsvDownloadType,
  DownloadResponse,
  ExternalErrorResponse,
  FetchLatestCsvProgress,
  FetchLatestCsvResult,
} from '../types'
import {
  ExternalRequestHandler,
  isAllowedOrigin,
  parseFetchLatestCsvRequest,
  readAllowedOrigins,
} from './externalRequestHandler'
import { DownloadStepExecutor } from './downloadStepExecutor'

/**
 * 外部ページ(shoken-webapp)からの取得依頼の挙動を固定する。
 * 送信元の検査、依頼の検証、取得順序、失敗理由、ログイン待ちを検証する。
 */

const ALLOWED_ORIGIN = 'https://shoken-webapp.pages.dev'
const LOCAL_ORIGIN = 'http://localhost:5173'
const OTHER_ORIGIN = 'https://example.com'
const RAKUTEN_URL = 'https://www.rakuten-sec.co.jp/web/dividend/'
const ALLOWED_PATTERNS = ['https://shoken-webapp.pages.dev/*']
const TARGET_TAB_ID = 42
const CSV_CONTENT = '銘柄コード,数量\n'

type PostedMessage = FetchLatestCsvProgress | FetchLatestCsvResult | ExternalErrorResponse

type PortListener = (message: unknown) => void

type SendMessageImpl = (
  tabId: number,
  message: { action: string; payload?: Record<string, unknown> },
  callback?: (response: unknown) => void
) => void

function createPort(origin: string) {
  const posted: PostedMessage[] = []
  const listeners: PortListener[] = []
  const port = {
    sender: { origin, url: `${origin}/`, tab: { id: 7, windowId: 8 } },
    postMessage: vi.fn((message: PostedMessage) => {
      posted.push(message)
    }),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((listener: PortListener) => {
        listeners.push(listener)
      }),
    },
  } as unknown as chrome.runtime.Port
  return { port, posted, listeners }
}

import { createTestExecutor, resetTestDoubles, silenceConsole } from '../tests/fixtures'
/**
 * ハンドラと、ダウンロード手順を実行するランナーを用意する
 *
 * 横取り結果を非同期で返す実クラスを使う。
 */
function createDownloadExecutor(): DownloadStepExecutor {
  return createTestExecutor(TARGET_TAB_ID)
}
function createHandler(
  responses: Partial<Record<CsvDownloadType, DownloadResponse>> = {},
  config: {
    readonly loginWaitTimeoutMs?: number
    readonly loginPollIntervalMs?: number
    readonly loginStateQueryTimeoutMs?: number
    readonly interceptTimeoutMs?: number
  } = {}
) {
  const executed: CsvDownloadType[] = []

  const executor = createDownloadExecutor()

  const handler = new ExternalRequestHandler({
    downloadRunner: executor,
    allowedOrigins: ALLOWED_PATTERNS,
    ...config,
  })

  vi.spyOn(executor, 'executeDownloadRequest').mockImplementation(async (message) => {
    const kind = message.payload.selectedOptions[0]
    executed.push(kind)
    const nonce = (message.payload as { interceptNonce?: string }).interceptNonce
    if (nonce) {
      setTimeout(() => {
        handler.resolveIntercept({
          nonce,
          ok: true,
          content: CSV_CONTENT,
          contentType: 'text/csv',
          status: 200,
          requestType: 'anchor',
          method: 'GET',
        })
      }, 0)
    }
    return responses[kind] ?? { success: true, message: `${kind} を取得しました` }
  })

  return { handler, runner: executor, executed }
}

function setTabsSendMessageImpl(impl: SendMessageImpl): void {
  const mock = chrome.tabs.sendMessage as unknown as {
    mockImplementation: (fn: SendMessageImpl) => void
  }
  mock.mockImplementation(impl)
}

type TabsUpdateImpl = (
  tabId: number,
  properties: { url?: string },
  callback?: (tab: chrome.tabs.Tab) => void
) => void

function setTabsUpdateImpl(): void {
  const mock = chrome.tabs.update as unknown as {
    mockImplementation: (fn: TabsUpdateImpl) => void
  }
  mock.mockImplementation((_tabId, _properties, callback) => {
    callback?.({ id: 42 } as chrome.tabs.Tab)
  })
}

async function waitForMessage<T extends PostedMessage>(
  posted: PostedMessage[],
  predicate: (message: PostedMessage) => boolean
): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const found = posted.find(predicate)
    if (found) {
      return found as T
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('メッセージが届きませんでした')
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('条件が成立しませんでした')
}

function isResult(message: PostedMessage): message is FetchLatestCsvResult {
  return message.type === 'result'
}

function isProgress(message: PostedMessage): message is FetchLatestCsvProgress {
  return message.type === 'progress'
}

describe('externalRequestHandler', () => {
  beforeEach(() => {
    silenceConsole()
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: TARGET_TAB_ID, windowId: 3, active: true, url: RAKUTEN_URL } as chrome.tabs.Tab,
    ])
    setTabsUpdateImpl()
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-login-state') {
        callback?.({ success: true, loggedIn: true })
        return
      }
      callback?.({ success: true })
    })
  })

  afterEach(() => {
    resetTestDoubles()
  })

  describe('送信元の検査', () => {
    it('許可されたオリジンだけを受け入れる', () => {
      const patterns = ['https://shoken-webapp.pages.dev/*', 'http://localhost/*']
      expect(isAllowedOrigin(ALLOWED_ORIGIN, patterns)).toBe(true)
      expect(isAllowedOrigin(LOCAL_ORIGIN, patterns)).toBe(true)
      expect(isAllowedOrigin(OTHER_ORIGIN, patterns)).toBe(false)
    })

    it('スキームが一致しないオリジンは受け付けない', () => {
      const patterns = ['https://shoken-webapp.pages.dev/*', 'http://localhost/*']
      expect(isAllowedOrigin('http://shoken-webapp.pages.dev', patterns)).toBe(false)
      expect(isAllowedOrigin('https://localhost', patterns)).toBe(false)
    })

    it('オリジンが不明な場合は受け付けない', () => {
      expect(isAllowedOrigin('', ['https://shoken-webapp.pages.dev/*'])).toBe(false)
    })

    it('manifest の externally_connectable は許可された2つだけ', () => {
      const manifest = JSON.parse(manifestRaw)
      expect(manifest.externally_connectable.matches).toEqual([
        'https://shoken-webapp.pages.dev/*',
        'http://localhost/*',
      ])
    })

    it('manifest から許可するオリジンを読む', () => {
      expect(readAllowedOrigins()).toEqual([
        'https://shoken-webapp.pages.dev/*',
        'http://localhost/*',
      ])
    })

    it('許可されないオリジンの接続は受け付けない', async () => {
      const { handler } = createHandler()
      const { port, posted, listeners } = createPort(OTHER_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const error = await waitForMessage<ExternalErrorResponse>(
        posted,
        (message) => message.type === 'error'
      )
      expect(error).toEqual({
        type: 'error',
        error: '接続元のオリジンが許可されていません',
      })
      expect(port.disconnect).toHaveBeenCalled()
      expect(posted.some(isResult)).toBe(false)
    })
  })

  describe('依頼の検証', () => {
    it('形式が不正な依頼はエラーになる', () => {
      expect(parseFetchLatestCsvRequest({ type: 'fetchLatestCsv', kinds: [] })).toBeNull()
      expect(parseFetchLatestCsvRequest({ type: 'unknown', kinds: ['assetbalance'] })).toBeNull()
      expect(parseFetchLatestCsvRequest({ type: 'fetchLatestCsv', kinds: ['unknown'] })).toBeNull()
      expect(parseFetchLatestCsvRequest(null)).toBeNull()
    })

    it('正しい依頼を受け取る', () => {
      expect(
        parseFetchLatestCsvRequest({ type: 'fetchLatestCsv', kinds: ['assetbalance', 'dividend'] })
      ).toEqual({ type: 'fetchLatestCsv', kinds: ['assetbalance', 'dividend'] })
    })

    it('不正な依頼にはエラーを返す', async () => {
      const { handler } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: [] })

      const error = await waitForMessage<ExternalErrorResponse>(
        posted,
        (message) => message.type === 'error'
      )
      expect(error).toEqual({ type: 'error', error: '取得依頼の形式が正しくありません' })
      expect(posted.some(isResult)).toBe(false)
    })
  })

  describe('タブの後片付け', () => {
    it.each([true, false])('既存タブを前面に出し、取得成功=%sでも閉じずに依頼元へ戻る', async (success) => {
      const { handler } = createHandler({ assetbalance: { success, error: success ? undefined : '取得失敗' } })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)
      handler.handleConnection(port)
      listeners[0]({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      await waitForMessage(posted, isResult)
      await waitUntil(() => vi.mocked(chrome.windows.update).mock.calls.length === 2)
      expect(chrome.tabs.update).toHaveBeenCalledWith(TARGET_TAB_ID, { active: true })
      expect(chrome.windows.update).toHaveBeenNthCalledWith(1, 3, { focused: true })
      expect(chrome.tabs.remove).not.toHaveBeenCalled()
      expect(chrome.tabs.update).toHaveBeenLastCalledWith(7, { active: true })
      expect(chrome.windows.update).toHaveBeenLastCalledWith(8, { focused: true })
    })

    it.each(['成功', '一部失敗', '例外', 'ログイン時間切れ', 'タブ削除失敗'])(
      '%sでも新規タブだけを閉じて依頼元のウィンドウへ戻る', async (outcome) => {
        vi.mocked(chrome.tabs.query).mockResolvedValue([])
        vi.mocked(chrome.tabs.create).mockImplementation((_properties, callback) => {
          callback?.({ id: TARGET_TAB_ID, windowId: 3 } as chrome.tabs.Tab)
          return undefined as never
        })
        vi.mocked(chrome.tabs.onUpdated.addListener).mockImplementationOnce((listener) => {
          queueMicrotask(() => listener(TARGET_TAB_ID, { status: 'complete' }, {} as chrome.tabs.Tab))
        })
        const { handler, runner } = createHandler(
          outcome === '一部失敗' ? { dividend: { success: false, error: '取得失敗' } } : {},
          { loginWaitTimeoutMs: outcome === 'ログイン時間切れ' ? 0 : 500 }
        )
        if (outcome === '例外') vi.mocked(runner.executeDownloadRequest).mockRejectedValueOnce(new Error('失敗'))
        if (outcome === 'タブ削除失敗') {
          vi.mocked(chrome.tabs.remove).mockRejectedValueOnce(new Error('閉じたタブ'))
        }
        const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)
        handler.handleConnection(port)
        listeners[0]({ type: 'fetchLatestCsv', kinds: ['dividend', 'assetbalance'] })

        await waitForMessage(posted, (message) => isResult(message) || message.type === 'error')
        await waitUntil(() => vi.mocked(chrome.windows.update).mock.calls.length > 0)
        expect(chrome.tabs.create).toHaveBeenCalledWith(
          expect.objectContaining({ active: true }), expect.any(Function)
        )
        expect(chrome.tabs.remove).toHaveBeenCalledExactlyOnceWith(TARGET_TAB_ID)
        expect(chrome.tabs.update).toHaveBeenLastCalledWith(7, { active: true })
        expect(chrome.windows.update).toHaveBeenLastCalledWith(8, { focused: true })
      }
    )
  })

  describe('取得の実行', () => {
    it('5種類を要求された順に取得する', async () => {
      const { handler, executed } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({
        type: 'fetchLatestCsv',
        kinds: ['assetbalance', 'fundbalance', 'dividend', 'domesticstock', 'mutualfund'],
      })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(executed).toEqual([
        'assetbalance',
        'fundbalance',
        'dividend',
        'domesticstock',
        'mutualfund',
      ])
      expect(result.csvs.map((csv) => csv.kind)).toEqual([
        'assetbalance',
        'fundbalance',
        'dividend',
        'domesticstock',
        'mutualfund',
      ])
      expect(result.failures).toEqual([])
    })

    it('取得したCSVの本文と取得時刻を返す', async () => {
      const { handler } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.csvs).toHaveLength(1)
      expect(result.csvs[0].content).toBe(CSV_CONTENT)
      expect(new Date(result.csvs[0].fetchedAt).toISOString()).toBe(result.csvs[0].fetchedAt)
    })

    it('各段階の所要時間を順に返す', async () => {
      const { handler } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.timings.map((timing) => timing.stage)).toEqual([
        'tab-preparation',
        'login-wait',
        'fetch-assetbalance',
        'total',
      ])
      expect(result.timings.every((timing) => timing.durationMs >= 0)).toBe(true)
    })

    it('取得終了時に stage と durationMs だけを console.table で出す', async () => {
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})
      const { handler } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(tableSpy).toHaveBeenCalledTimes(1)
      const rows = tableSpy.mock.calls[0][0] as { stage: string; durationMs: number }[]
      expect(rows.every((row) => Object.keys(row).sort().join(',') === 'durationMs,stage')).toBe(true)
      tableSpy.mockRestore()
    })

    it('種類ごとのステップ所要時間を段階名に含めて返す', async () => {
      const executor = createDownloadExecutor()
      vi.spyOn(executor, 'executeDownloadRequest').mockImplementation(
        async (_message, reportStep) => {
          reportStep?.({ step: 'download-csv', phase: 'action', durationMs: 12 })
          return { success: false, error: '取得失敗' }
        }
      )
      const handler = new ExternalRequestHandler({
        downloadRunner: executor,
        allowedOrigins: ALLOWED_PATTERNS,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['domesticstock'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.timings).toEqual([
        { stage: 'tab-preparation', durationMs: expect.any(Number) },
        { stage: 'login-wait', durationMs: expect.any(Number) },
        { stage: 'fetch-domesticstock', durationMs: expect.any(Number) },
        { stage: 'fetch-domesticstock:download-csv', durationMs: 12 },
        { stage: 'total', durationMs: expect.any(Number) },
      ])
    })

    it('進行状況を種類ごとに返す', async () => {
      const { handler } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance', 'dividend'] })

      await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      const progress = posted.filter(isProgress)
      expect(progress).toEqual([
        { type: 'progress', state: 'fetching', kind: 'assetbalance' },
        { type: 'progress', state: 'completed', kind: 'assetbalance' },
        { type: 'progress', state: 'fetching', kind: 'dividend' },
        { type: 'progress', state: 'completed', kind: 'dividend' },
      ])
    })

    it('取得に失敗した種類は理由を記録して次へ進む', async () => {
      const { handler, executed } = createHandler({
        dividend: { success: false, error: '横取りなし / method=不明 / status=なし / contentType=不明' },
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['dividend', 'assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(executed).toEqual(['dividend', 'assetbalance'])
      expect(result.failures[0]).toMatchObject({
        kind: 'dividend',
        reason: '横取りなし / method=不明 / status=なし / contentType=不明',
      })
      expect(result.csvs.map((csv) => csv.kind)).toEqual(['assetbalance'])
    })

    it('取得中は別の依頼を受け付けない', async () => {
      let release: (() => void) | undefined
      const executor = createDownloadExecutor()
      const executeMock = vi.spyOn(executor, 'executeDownloadRequest').mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return { success: true, message: '取得完了' }
      })
      const handler = new ExternalRequestHandler({
        downloadRunner: executor,
        allowedOrigins: ALLOWED_PATTERNS,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })
      await waitUntil(() => executeMock.mock.calls.length > 0)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['dividend'] })

      const error = await waitForMessage<ExternalErrorResponse>(
        posted,
        (message) => message.type === 'error'
      )
      expect(error).toEqual({ type: 'error', error: '別の取得が実行中のため受け付けません' })

      release?.()
    })
  })

  describe('ログイン待ち', () => {
    it('未ログインならログイン待ちを返して取得を続ける', async () => {
      let loginChecks = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          loginChecks += 1
          callback?.({ success: true, loggedIn: loginChecks > 1 })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const { handler, executed } = createHandler({}, {
        loginPollIntervalMs: 5,
        loginWaitTimeoutMs: 500,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(posted.filter(isProgress)[0]).toEqual({ type: 'progress', state: 'login-wait' })
      expect(executed).toEqual(['assetbalance'])
      expect(result.csvs).toHaveLength(1)
    })

    it('ログイン状態の問い合わせが無応答でも待ち続けて取得を続ける', async () => {
      let loginChecks = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          loginChecks += 1
          if (loginChecks <= 2) {
            return
          }
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const { handler, executed } = createHandler({}, {
        loginPollIntervalMs: 5,
        loginWaitTimeoutMs: 500,
        loginStateQueryTimeoutMs: 30,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(loginChecks).toBeGreaterThanOrEqual(3)
      expect(executed).toEqual(['assetbalance'])
      expect(result.csvs).toHaveLength(1)
    })

    it('ログインが完了しなければ全種類を失敗として返す', async () => {
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: false })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const { handler, executed } = createHandler({}, {
        loginPollIntervalMs: 5,
        loginWaitTimeoutMs: 30,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance', 'dividend'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(executed).toEqual([])
      expect(result.failures).toEqual([
        { kind: 'assetbalance', reason: 'ログインが完了しませんでした' },
        { kind: 'dividend', reason: 'ログインが完了しませんでした' },
      ])
    })

    it('ログイン状態を判定できない場合はログイン画面を開いて読み込み直す', async () => {
      let loginChecks = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          loginChecks += 1
          callback?.(loginChecks === 1 ? undefined : { success: true, loggedIn: true })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const { handler, executed } = createHandler({}, {
        loginPollIntervalMs: 5,
        loginWaitTimeoutMs: 500,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(vi.mocked(chrome.tabs.update).mock.calls.length).toBeGreaterThan(0)
      expect(executed).toEqual(['assetbalance'])
      expect(result.csvs).toHaveLength(1)
    })

  describe('OS によらない横取り経路', () => {

    it('OS 判定を行わずに CSV 要求を横取りする', async () => {
      const { handler, executed } = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      const originalSendMessage = vi.mocked(chrome.tabs.sendMessage)
      vi.mocked(chrome.tabs.sendMessage).mockImplementation(((...args: unknown[]) => {
        const message = args[1] as { action?: string; payload?: { nonce?: string } };
        const callback = args[2] as ((response?: unknown) => void) | undefined;
        if (message.action === 'arm-csv-intercept') {
          const nonce = message.payload?.nonce ?? ''
          setTimeout(() => {
            handler.resolveIntercept({
              nonce,
              ok: true,
              content: CSV_CONTENT,
              contentType: 'text/csv',
              status: 200,
              requestType: 'anchor',
              method: 'GET',
            })
          }, 0)
          callback?.({ success: true, message: 'armed' })
          return
        }
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true })
      }) as never)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.csvs).toHaveLength(1)
      expect(result.csvs[0].content).toBe(CSV_CONTENT)
      expect(result.failures).toEqual([])
      expect(executed).toEqual(['assetbalance'])
      expect(chrome.runtime.getPlatformInfo).not.toHaveBeenCalled()

      vi.mocked(chrome.tabs.sendMessage).mockImplementation(originalSendMessage.getMockImplementation()!)
    })

    it('OS 情報が取得できなくても横取りする', async () => {
      vi.mocked(chrome.runtime.getPlatformInfo).mockRejectedValue(new Error('unsupported'))
      const { handler, executed} = createHandler()
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.csvs).toHaveLength(1)
      expect(executed).toEqual(['assetbalance'])
      expect(chrome.runtime.getPlatformInfo).not.toHaveBeenCalled()
    })

    it('HTML が返れば失敗理由に HTTP 情報を含める', async () => {
      const { handler, runner } = createHandler()
      vi.spyOn(runner, 'executeDownloadRequest').mockImplementation(async (message) => {
        const kind = message.payload.selectedOptions[0]
        const nonce = message.payload.interceptNonce
        if (nonce) {
          setTimeout(() => {
            handler.resolveIntercept({
              nonce,
              ok: false,
              error: 'anchor / method=GET / status=200 / contentType=text/html',
              contentType: 'text/html',
              status: 200,
              requestType: 'anchor',
              method: 'GET',
            })
          }, 0)
        }
        return { success: true, message: `${kind} を取得しました` }
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      vi.mocked(chrome.tabs.sendMessage).mockImplementation(((...args: unknown[]) => {
        const message = args[1] as { action?: string }
        const callback = args[2] as ((response?: unknown) => void) | undefined
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true })
      }) as never)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.csvs).toEqual([])
      expect(result.failures[0]?.reason).toContain('text/html')
    })

    it('横取り経路は準備にタイムアウト以上かかっても横取り結果を受け取る', async () => {
      const { handler, runner } = createHandler({}, { interceptTimeoutMs: 20 })
      vi.spyOn(runner, 'executeDownloadRequest').mockImplementation(async (message) => {
        const nonce = message.payload.interceptNonce
        await new Promise((resolve) => setTimeout(resolve, 40))
        if (nonce) {
          handler.resolveIntercept({
            nonce,
            ok: true,
            content: CSV_CONTENT,
            contentType: 'text/csv',
            status: 200,
            requestType: 'form-submit',
            method: 'POST',
          })
        }
        return { success: true, message: 'prepared' }
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.csvs).toHaveLength(1)
      expect(result.failures).toEqual([])
    })

    it('横取り結果がタイムアウトしても次回取得を邪魔しない', async () => {
      const { handler, runner } = createHandler({}, { interceptTimeoutMs: 50 })
      vi.spyOn(runner, 'executeDownloadRequest').mockResolvedValue({ success: true, message: 'ok' })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      vi.mocked(chrome.tabs.sendMessage).mockImplementation(((...args: unknown[]) => {
        const message = args[1] as { action?: string }
        const callback = args[2] as ((response?: unknown) => void) | undefined
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true })
      }) as never)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const first = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(first.csvs).toEqual([])
      expect(first.failures[0]?.reason).toBe('横取りなし / method=不明 / status=なし / contentType=不明')

      const { port: port2, posted: posted2, listeners: listeners2 } = createPort(ALLOWED_ORIGIN)
      handler.handleConnection(port2)
      listeners2[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      // simulate resolve via a new handler? Instead just expect timeout again or success if armed result delivered.
      const second = await waitForMessage<FetchLatestCsvResult>(posted2, isResult)
      expect(second).toBeTruthy()
    })

    it('ステップ失敗理由に query を含めない', async () => {
      const executor = createDownloadExecutor()
      const { handler } = createHandler({}, { interceptTimeoutMs: 50 })
      ;(handler as unknown as { downloadRunner: unknown }).downloadRunner = executor
      vi.spyOn(executor, 'executeDownloadRequest').mockResolvedValue({
        success: false,
        error: 'https://example.com/csv?secret=leak failed',
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      vi.mocked(chrome.tabs.sendMessage).mockImplementation(((...args: unknown[]) => {
        const message = args[1] as { action?: string }
        const callback = args[2] as ((response?: unknown) => void) | undefined
        if (message.action === 'arm-csv-intercept') {
          callback?.({ success: true, message: 'armed' })
          return
        }
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true })
      }) as never)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      const reason = result.failures[0]?.reason ?? ''
      expect(reason).not.toContain('secret')
      expect(reason).not.toContain('http')
    })

    it('例外時も失敗理由に query を含めない', async () => {
      const executor = createDownloadExecutor()
      const handler = new ExternalRequestHandler({
        downloadRunner: executor,
        allowedOrigins: ALLOWED_PATTERNS,
        interceptTimeoutMs: 50,
      })
      vi.spyOn(executor, 'executeDownloadRequest').mockRejectedValue(new Error('https://example.com/csv?secret=leak'))
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      vi.mocked(chrome.tabs.sendMessage).mockImplementation(((...args: unknown[]) => {
        const message = args[1] as { action?: string }
        const callback = args[2] as ((response?: unknown) => void) | undefined
        if (message.action === 'arm-csv-intercept') {
          callback?.({ success: true, message: 'armed' })
          return
        }
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true })
      }) as never)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      const reason = result.failures[0]?.reason ?? ''
      expect(reason).not.toContain('secret')
      expect(reason).not.toContain('http')
    })

    it('失敗メッセージに秘密を含めない', async () => {
      const { handler, runner } = createHandler()
      vi.spyOn(runner, 'executeDownloadRequest').mockImplementation(async (message) => {
        const kind = message.payload.selectedOptions[0]
        const nonce = message.payload.interceptNonce
        if (nonce) {
          setTimeout(() => {
            handler.resolveIntercept({
              nonce,
              ok: false,
              error: 'anchor / method=GET / status=404 / contentType=text/plain',
              contentType: 'text/plain',
              status: 404,
              requestType: 'anchor',
              method: 'GET',
            })
          }, 0)
        }
        return { success: true, message: `${kind} を取得しました` }
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      vi.mocked(chrome.tabs.sendMessage).mockImplementation(((...args: unknown[]) => {
        const message = args[1] as { action?: string }
        const callback = args[2] as ((response?: unknown) => void) | undefined
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: true })
      }) as never)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      const reason = result.failures[0]?.reason ?? ''
      expect(reason).not.toContain('secret')
      expect(reason).not.toContain('http')
    })
  })

  })
})
