import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, CsvDownloadStep, DownloadResponse } from '../types'
import { RakutenUtils, DomUtils } from '../utils'
import { onExecute } from './rakutenContentScript'

/**
 * ステップ実行の挙動を固定する characterization test。
 * 単一ステップも1要素の downloadSteps 配列として送る。
 */
describe('rakutenContentScript ステップ実行', () => {
  type Listener = (message: ChromeMessage, sender: unknown, sendResponse: (r: DownloadResponse) => void) => boolean

  let listener: Listener

  function sendMessage(message: ChromeMessage): Promise<DownloadResponse> {
    return new Promise((resolve) => {
      listener(message, {}, resolve)
    })
  }

  function singleStep(step: CsvDownloadStep, selectors: Record<string, string>) {
    return sendMessage({
      action: 'execute-csv-download-steps',
      payload: { downloadSteps: [step], selectors },
    } as unknown as ChromeMessage)
  }

  function makeInteractable(element: HTMLElement) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 30,
      top: 0,
      left: 0,
      bottom: 30,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
  }

  // シングルトンのため初期化は1回だけ行い、リスナー参照を保持する
  beforeAll(() => {
    vi.spyOn(RakutenUtils, 'isRakutenSecurities').mockReturnValue(true)
    onExecute()
    const addListener = vi.mocked(chrome.runtime.onMessage.addListener)
    expect(addListener).toHaveBeenCalled()
    listener = addListener.mock.calls[addListener.mock.calls.length - 1][0] as unknown as Listener
  })

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML = ''
    vi.spyOn(RakutenUtils, 'isRakutenSecurities').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('セレクター未指定時のエラーメッセージ', () => {
    it('navigate-to-page', async () => {
      const res = await singleStep('navigate-to-page', {})
      expect(res).toEqual({ success: false, error: 'ページ遷移のセレクターが指定されていません', step: 'navigate-to-page' })
    })

    it('select-tab', async () => {
      const res = await singleStep('select-tab', {})
      expect(res).toEqual({ success: false, error: 'タブ選択のセレクターが指定されていません', step: 'select-tab' })
    })

    it('select-period', async () => {
      const res = await singleStep('select-period', {})
      expect(res).toEqual({ success: false, error: '期間選択のセレクターが指定されていません', step: 'select-period' })
    })

    it('display-data', async () => {
      const res = await singleStep('display-data', {})
      expect(res).toEqual({ success: false, error: 'データ表示のセレクターが指定されていません', step: 'display-data' })
    })

    it('download-csv', async () => {
      const res = await singleStep('download-csv', {})
      expect(res).toEqual({ success: false, error: 'CSVダウンロードのセレクターが指定されていません', step: 'download-csv' })
    })
  })

  describe('成功時のメッセージ', () => {
    it('navigate-to-page', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      document.body.appendChild(el)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('select-tab', async () => {
      const el = document.createElement('a')
      el.id = 'tab'
      document.body.appendChild(el)
      const res = await singleStep('select-tab', { tabSelector: '#tab' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('select-period', async () => {
      const el = document.createElement('input')
      el.id = 'period'
      document.body.appendChild(el)
      const res = await singleStep('select-period', { periodRadio: '#period' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('display-data', async () => {
      const el = document.createElement('button')
      el.id = 'display'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await singleStep('display-data', { displayButton: '#display' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('download-csv', async () => {
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await singleStep('download-csv', { csvButton: '#csv' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })
  })

  describe('クリック失敗時のメッセージ', () => {
    it('navigate-to-page はクリック失敗エラーを返す', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      document.body.appendChild(el)
      vi.spyOn(DomUtils, 'safeClick').mockReturnValue(false)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({ success: false, error: 'ページ遷移のクリックに失敗しました', step: 'navigate-to-page' })
    })

    it('download-csv はクリック失敗エラーを返す', async () => {
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)
      vi.spyOn(DomUtils, 'safeClick').mockReturnValue(false)
      const res = await singleStep('download-csv', { csvButton: '#csv' })
      expect(res).toEqual({ success: false, error: 'CSVダウンロードのクリックに失敗しました', step: 'download-csv' })
    })
  })

  describe('requireInteractable の使い分け', () => {
    it('navigate系は非表示要素でも即時成功する', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      el.style.display = 'none'
      document.body.appendChild(el)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('display-data は要素不在でタイムアウトエラーを返す', async () => {
      vi.useFakeTimers()
      try {
        const pending = singleStep('display-data', { displayButton: '#missing-display' })
        await vi.advanceTimersByTimeAsync(6000)
        const res = await pending
        expect(res).toEqual({
          success: false,
          error: '要素が見つかりませんでした: #missing-display (5000ms)',
          step: 'display-data',
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('display-data は後から出現した操作可能要素で成功する', async () => {
      const pending = singleStep('display-data', { displayButton: '#late-display' })
      const el = document.createElement('button')
      el.id = 'late-display'
      await new Promise((r) => setTimeout(r, 50))
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await pending
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })
  })

  describe('ステップ群実行', () => {
    it('select-period のセレクター未指定は step 付きで返す', async () => {
      const res = await sendMessage({
        action: 'execute-csv-download-steps',
        payload: { downloadSteps: ['select-period'], selectors: {} },
      } as unknown as ChromeMessage)
      expect(res).toEqual({
        success: false,
        error: '期間選択のセレクターが指定されていません',
        step: 'select-period',
      })
    })

    it('同一ページ内の連続ステップが成功する', async () => {
      const period = document.createElement('input')
      period.id = 'period'
      document.body.appendChild(period)
      const csv = document.createElement('button')
      csv.id = 'csv'
      document.body.appendChild(csv)
      makeInteractable(csv)
      const res = await sendMessage({
        action: 'execute-csv-download-steps',
        payload: {
          downloadSteps: ['select-period', 'download-csv'],
          selectors: { periodRadio: '#period', csvButton: '#csv' },
        },
      } as unknown as ChromeMessage)
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
    })
  })

  describe('未対応ステップとサイト判定', () => {
    it('未対応ステップはエラーを返す', async () => {
      const res = await singleStep('unknown-step' as CsvDownloadStep, {})
      expect(res).toEqual({
        success: false,
        error: '未対応のダウンロードステップです: unknown-step',
        step: 'unknown-step',
      })
    })

    it('楽天証券サイトでない場合はエラーを返す', async () => {
      vi.mocked(RakutenUtils.isRakutenSecurities).mockReturnValue(false)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({
        success: false,
        error: '楽天証券のサイトではありません',
        step: 'navigate-to-page',
      })
    })
  })

  describe('ダウンロード開始の通知', () => {
    function stubRuntimeSendMessage() {
      const sendMessageMock = chrome.runtime.sendMessage as unknown as {
        mockImplementation: (fn: (message: unknown) => unknown) => void
        mock: { calls: unknown[][] }
      }
      sendMessageMock.mockImplementation(() => Promise.resolve({ success: true }))
      return sendMessageMock
    }

    async function clickCsvButton(captureDownloadStart?: boolean) {
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)

      return sendMessage({
        action: 'execute-csv-download-steps',
        payload: {
          downloadSteps: ['download-csv'],
          selectors: { csvButton: '#csv' },
          captureDownloadStart,
        },
      } as unknown as ChromeMessage)
    }

    it('取得待ちの依頼ではクリック前にバックグラウンドへ通知する', async () => {
      const sendMessageMock = stubRuntimeSendMessage()

      const res = await clickCsvButton(true)
      expect(res.success).toBe(true)
      expect(sendMessageMock.mock.calls[0][0]).toEqual({ action: 'csv-download-will-start' })
    })

    it('通常のダウンロードでは通知しない', async () => {
      const sendMessageMock = stubRuntimeSendMessage()

      const res = await clickCsvButton()
      expect(res.success).toBe(true)
      expect(sendMessageMock.mock.calls).toHaveLength(0)
    })
  })

  describe('ログイン状態の確認', () => {
    it('パスワード入力欄があれば未ログインと判定する', async () => {
      document.body.innerHTML = '<input type="password" />'
      const res = await sendMessage({ action: 'check-login-state' } as unknown as ChromeMessage)
      expect(res).toEqual({ success: true, loggedIn: false })
    })

    it('パスワード入力欄が無ければログイン済みと判定する', async () => {
      document.body.innerHTML = '<div>保有銘柄</div>'
      const res = await sendMessage({ action: 'check-login-state' } as unknown as ChromeMessage)
      expect(res).toEqual({ success: true, loggedIn: true })
    })
  })

  describe('CSV本文の取得', () => {
    const CSV_URL = 'https://www.rakuten-sec.co.jp/csv/assetbalance.csv'

    // "銘柄コード,数量\n" の Shift_JIS 表現
    const shiftJisBytes = new Uint8Array([
      0x96, 0xc1, 0x95, 0xbf, 0x83, 0x52, 0x81, 0x5b, 0x83, 0x68, 0x2c, 0x90, 0x94, 0x97, 0xca,
      0x0a,
    ])

    function stubFetch(response: Response | Error): void {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (response instanceof Error) {
            throw response
          }
          return response
        })
      )
    }

    it('Cookie 付きで取得して本文を返す', async () => {
      const fetchMock = vi.fn(async () => new Response(shiftJisBytes, { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)

      const res = await sendMessage({
        action: 'fetch-csv-content',
        payload: { url: CSV_URL },
      } as unknown as ChromeMessage)

      expect(res).toEqual({ success: true, content: '銘柄コード,数量\n' })
      expect(fetchMock).toHaveBeenCalledWith(CSV_URL, { credentials: 'include' })
    })

    it('HTTP エラーの場合は理由を返す', async () => {
      stubFetch(new Response('', { status: 403 }))
      const res = await sendMessage({
        action: 'fetch-csv-content',
        payload: { url: CSV_URL },
      } as unknown as ChromeMessage)
      expect(res).toEqual({ success: false, error: 'CSVの取得に失敗しました（HTTP 403）' })
    })

    it('HTMLが返された場合はCSVとして扱わない', async () => {
      stubFetch(new Response('<html><body>ログイン</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }))
      const res = await sendMessage({
        action: 'fetch-csv-content',
        payload: { url: CSV_URL },
      } as unknown as ChromeMessage)
      expect(res).toEqual({
        success: false,
        error: 'CSVの代わりにHTMLが返されました（ログインが必要な可能性があります）',
      })
    })

    it('本文がCSVならContent-Typeがtext/htmlでも扱う', async () => {
      stubFetch(new Response(shiftJisBytes, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }))
      const res = await sendMessage({
        action: 'fetch-csv-content',
        payload: { url: CSV_URL },
      } as unknown as ChromeMessage)
      expect(res).toEqual({ success: true, content: '銘柄コード,数量\n' })
    })

    it('取得に失敗した場合はURLを含まない理由を返す', async () => {
      stubFetch(new Error('network error'))
      const res = await sendMessage({
        action: 'fetch-csv-content',
        payload: { url: CSV_URL },
      } as unknown as ChromeMessage)
      expect(res).toEqual({ success: false, error: 'CSVの取得に失敗しました' })
    })
  })
})
