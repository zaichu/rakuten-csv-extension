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
  isCapturableDownloadUrl,
  parseFetchLatestCsvRequest,
  readAllowedOrigins,
} from './externalRequestHandler'

/**
 * 外部ページ(shoken-webapp)からの取得依頼の挙動を固定する。
 * 送信元の検査、依頼の検証、取得順序、失敗理由、ログイン待ちを検証する。
 */

const ALLOWED_ORIGIN = 'https://shoken-webapp.pages.dev'
const LOCAL_ORIGIN = 'http://localhost:5173'
const OTHER_ORIGIN = 'https://example.com'
const RAKUTEN_URL = 'https://www.rakuten-sec.co.jp/web/dividend/'

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
    sender: { origin, url: `${origin}/` },
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

function createRunner(responses: Partial<Record<CsvDownloadType, DownloadResponse>> = {}) {
  const executed: CsvDownloadType[] = []
  const runner = {
    executeDownloadRequest: vi.fn(
      async (message: { payload: { selectedOptions: readonly CsvDownloadType[] } }) => {
        const kind = message.payload.selectedOptions[0]
        executed.push(kind)
        fireDownloadCreated(`https://www.rakuten-sec.co.jp/csv/${kind}.csv`)
        return responses[kind] ?? { success: true, message: `${kind} を取得しました` }
      }
    ),
  }
  return { runner, executed }
}

function fireDownloadCreated(url: string): void {
  const addListener = chrome.downloads.onCreated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (item: chrome.downloads.DownloadItem) => void
    listener({ url } as chrome.downloads.DownloadItem)
  }
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
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(chrome.tabs.query).mockResolvedValue([
      { id: 42, active: true, url: RAKUTEN_URL } as chrome.tabs.Tab,
    ])
    setTabsUpdateImpl()
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-login-state') {
        callback?.({ success: true, loggedIn: true })
        return
      }
      if (message.action === 'fetch-csv-content') {
        callback?.({ success: true, content: `本文:${message.payload?.['url']}` })
        return
      }
      callback?.({ success: true })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
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

    it('捕捉するダウンロードURLは楽天証券のドメインとblob/dataに限る', () => {
      expect(isCapturableDownloadUrl('https://www.rakuten-sec.co.jp/csv/a.csv')).toBe(true)
      expect(isCapturableDownloadUrl('https://member.rakuten-sec.co.jp/csv/a.csv')).toBe(true)
      expect(isCapturableDownloadUrl('blob:https://www.rakuten-sec.co.jp/1234')).toBe(true)
      expect(isCapturableDownloadUrl('data:text/csv;base64,aaaa')).toBe(true)
      expect(isCapturableDownloadUrl('https://example.com/a.csv')).toBe(false)
      expect(isCapturableDownloadUrl('https://rakuten-sec.co.jp.example.com/a.csv')).toBe(false)
      expect(isCapturableDownloadUrl('not a url')).toBe(false)
    })

    it('許可されないオリジンの接続は受け付けない', async () => {
      const handler = new ExternalRequestHandler({
        downloadRunner: createRunner().runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
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
      const handler = new ExternalRequestHandler({
        downloadRunner: createRunner().runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
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

  describe('取得の実行', () => {
    it('5種類を要求された順に取得する', async () => {
      const { runner, executed } = createRunner()
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
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
      const { runner } = createRunner()
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.csvs).toHaveLength(1)
      expect(result.csvs[0].content).toBe(
        '本文:https://www.rakuten-sec.co.jp/csv/assetbalance.csv'
      )
      expect(new Date(result.csvs[0].fetchedAt).toISOString()).toBe(result.csvs[0].fetchedAt)
    })

    it('進行状況を種類ごとに返す', async () => {
      const { runner } = createRunner()
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
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
      const { runner, executed } = createRunner({
        dividend: { success: false, error: '表示ステップで失敗: 要素が見つかりませんでした' },
      })
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['dividend', 'assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(executed).toEqual(['dividend', 'assetbalance'])
      expect(result.failures).toEqual([
        { kind: 'dividend', reason: '表示ステップで失敗: 要素が見つかりませんでした' },
      ])
      expect(result.csvs.map((csv) => csv.kind)).toEqual(['assetbalance'])
    })

    it('CSV本文の取得に失敗した場合は理由を記録する', async () => {
      const { runner } = createRunner()
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: true })
          return
        }
        callback?.({ success: false, error: 'CSVの取得に失敗しました（HTTP 403）' })
      })

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.failures).toEqual([
        { kind: 'assetbalance', reason: 'CSVの取得に失敗しました（HTTP 403）' },
      ])
      expect(result.csvs).toEqual([])
    })

    it('取得中は別の依頼を受け付けない', async () => {
      let release: (() => void) | undefined
      const runner = {
        executeDownloadRequest: vi.fn(async () => {
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return { success: true, message: '取得完了' }
        }),
      }
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
        downloadStartTimeoutMs: 50,
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })
      await waitUntil(() => runner.executeDownloadRequest.mock.calls.length > 0)
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
      const { runner, executed } = createRunner()
      let loginChecks = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          loginChecks += 1
          callback?.({ success: true, loggedIn: loginChecks > 1 })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
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

    it('ログインが完了しなければ全種類を失敗として返す', async () => {
      const { runner, executed } = createRunner()
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: false })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
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
      const { runner, executed } = createRunner()
      let loginChecks = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          loginChecks += 1
          callback?.(loginChecks === 1 ? undefined : { success: true, loggedIn: true })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ['https://shoken-webapp.pages.dev/*'],
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
  })
})
