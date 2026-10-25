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
import type { DownloadedFileReader } from './downloadedFile'

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
const OTHER_TAB_ID = 99
const DOWNLOAD_ID = 11
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

/**
 * ダウンロード済みファイルの情報
 */
const downloadedItems = new Map<number, chrome.downloads.DownloadItem>()

function createDownloadItem(id: number, kind: CsvDownloadType): chrome.downloads.DownloadItem {
  return {
    id,
    url: `https://www.rakuten-sec.co.jp/csv/${kind}.csv`,
    finalUrl: `https://www.rakuten-sec.co.jp/csv/${kind}.csv`,
    filename: `/home/user/Downloads/rakuten_${kind}.csv`,
    fileSize: 128,
    state: 'complete',
  } as chrome.downloads.DownloadItem
}

/**
 * ファイルを読み取る口
 */
function createFileReader(
  options: { readonly fileAccessAllowed?: boolean; readonly readError?: Error } = {}
): DownloadedFileReader {
  return {
    isFileAccessAllowed: vi.fn(async () => options.fileAccessAllowed ?? true),
    read: vi.fn(async () => {
      if (options.readError) {
        throw options.readError
      }
      return new TextEncoder().encode(CSV_CONTENT)
    }),
    removeFile: vi.fn(async () => true),
    eraseHistory: vi.fn(async () => undefined),
  }
}

/**
 * ハンドラと、ダウンロード手順を実行するランナーを用意する
 *
 * ランナーは実際のコンテンツスクリプトと同じく、クリック直前にバックグラウンドへ
 * 通知してからダウンロードを発生させる
 */
function createHandler(
  responses: Partial<Record<CsvDownloadType, DownloadResponse>> = {},
  config: {
    readonly downloadStartTimeoutMs?: number
    readonly loginWaitTimeoutMs?: number
    readonly loginPollIntervalFastMs?: number
    readonly fileReader?: DownloadedFileReader
  } = {}
) {
  const executed: CsvDownloadType[] = []

  const runner = {
    executeDownloadRequest: vi.fn(
      async (message: { payload: { selectedOptions: readonly CsvDownloadType[] } }) => {
        const kind = message.payload.selectedOptions[0]
        executed.push(kind)
        handler.notifyDownloadWillStart(TARGET_TAB_ID)
        downloadedItems.set(DOWNLOAD_ID, createDownloadItem(DOWNLOAD_ID, kind))
        fireDownloadCreated({
          id: DOWNLOAD_ID,
          url: `https://www.rakuten-sec.co.jp/csv/${kind}.csv`,
        })
        return responses[kind] ?? { success: true, message: `${kind} を取得しました` }
      }
    ),
  }

  const handler = new ExternalRequestHandler({
    downloadRunner: runner,
    allowedOrigins: ALLOWED_PATTERNS,
    fileReader: config.fileReader ?? createFileReader(),
    ...config,
  })

  return { handler, runner, executed }
}

function fireDownloadCreated(item: { id: number; url: string }): void {
  const addListener = chrome.downloads.onCreated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (created: chrome.downloads.DownloadItem) => void
    listener(item as unknown as chrome.downloads.DownloadItem)
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

type DownloadsSearchImpl = (query: { id?: number }) => Promise<chrome.downloads.DownloadItem[]>

function setDownloadsSearchImpl(): void {
  const mock = chrome.downloads.search as unknown as {
    mockImplementation: (fn: DownloadsSearchImpl) => void
  }
  mock.mockImplementation(async (query) => {
    const item = query.id === undefined ? undefined : downloadedItems.get(query.id)
    return item ? [item] : []
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
      { id: TARGET_TAB_ID, windowId: 3, active: true, url: RAKUTEN_URL } as chrome.tabs.Tab,
    ])
    downloadedItems.clear()
    setDownloadsSearchImpl()
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
        if (outcome === '例外') runner.executeDownloadRequest.mockRejectedValueOnce(new Error('失敗'))
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
        dividend: { success: false, error: '表示ステップで失敗: 要素が見つかりませんでした' },
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

    it('ファイルを読み取れなかった場合は理由を記録する', async () => {
      const { handler } = createHandler(
        {},
        { fileReader: createFileReader({ readError: new Error('read failed') }) }
      )
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.failures).toEqual([
        { kind: 'assetbalance', reason: 'CSVファイルの読み取りに失敗しました' },
      ])
      expect(result.csvs).toEqual([])
    })

    it('ファイルのURLへのアクセスが許可されていない場合は理由とコードを返す', async () => {
      const { handler } = createHandler(
        {},
        { fileReader: createFileReader({ fileAccessAllowed: false }) }
      )
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.failures).toEqual([
        {
          kind: 'assetbalance',
          reason: 'ファイルの URL へのアクセスが許可されていません',
          code: 'file-access-disabled',
        },
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
        allowedOrigins: ALLOWED_PATTERNS,
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

  describe('ダウンロード開始の待ち受け', () => {
    it('クリック直前の通知より前のダウンロードは捕捉しない', async () => {
      const runner = {
        executeDownloadRequest: vi.fn(async () => {
          fireDownloadCreated({ id: 1, url: 'https://www.rakuten-sec.co.jp/csv/other.csv' })
          handler.notifyDownloadWillStart(TARGET_TAB_ID)
          downloadedItems.set(DOWNLOAD_ID, createDownloadItem(DOWNLOAD_ID, 'assetbalance'))
          fireDownloadCreated({
            id: DOWNLOAD_ID,
            url: 'https://www.rakuten-sec.co.jp/csv/assetbalance.csv',
          })
          return { success: true, message: '取得完了' }
        }),
      }
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ALLOWED_PATTERNS,
        downloadStartTimeoutMs: 50,
        fileReader: createFileReader(),
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.failures).toEqual([])
      expect(result.csvs[0].content).toBe(CSV_CONTENT)
    })

    it('対象タブ以外からの通知では待ち受けを開始しない', async () => {
      const runner = {
        executeDownloadRequest: vi.fn(async () => {
          handler.notifyDownloadWillStart(OTHER_TAB_ID)
          fireDownloadCreated({ id: 1, url: 'https://www.rakuten-sec.co.jp/csv/other.csv' })
          return { success: true, message: '取得完了' }
        }),
      }
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ALLOWED_PATTERNS,
        downloadStartTimeoutMs: 30,
        fileReader: createFileReader(),
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.failures).toEqual([
        { kind: 'assetbalance', reason: 'CSVのダウンロードを開始できませんでした' },
      ])
      expect(result.csvs).toEqual([])
    })

    it('通知が無い場合はダウンロードを取り逃がす', async () => {
      const runner = {
        executeDownloadRequest: vi.fn(async () => {
          fireDownloadCreated({
            id: DOWNLOAD_ID,
            url: 'https://www.rakuten-sec.co.jp/csv/assetbalance.csv',
          })
          return { success: true, message: '取得完了' }
        }),
      }
      const handler = new ExternalRequestHandler({
        downloadRunner: runner,
        allowedOrigins: ALLOWED_PATTERNS,
        downloadStartTimeoutMs: 30,
        fileReader: createFileReader(),
      })
      const { port, posted, listeners } = createPort(ALLOWED_ORIGIN)

      handler.handleConnection(port)
      listeners[0]?.({ type: 'fetchLatestCsv', kinds: ['assetbalance'] })

      const result = await waitForMessage<FetchLatestCsvResult>(posted, isResult)
      expect(result.failures).toEqual([
        { kind: 'assetbalance', reason: 'CSVのダウンロードを開始できませんでした' },
      ])
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
        loginPollIntervalFastMs: 5,
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
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-login-state') {
          callback?.({ success: true, loggedIn: false })
          return
        }
        callback?.({ success: true, content: '本文' })
      })

      const { handler, executed } = createHandler({}, {
        loginPollIntervalFastMs: 5,
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
        loginPollIntervalFastMs: 5,
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
