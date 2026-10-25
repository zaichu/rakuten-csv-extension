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

    it('download-csv はクリックが失敗しても応答を失敗にしない', async () => {
      // クリックは応答送信後に走るため、クリックの成否は応答に反映できない。
      // ダウンロードが始まったかはバックグラウンドが判定する
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)
      vi.spyOn(DomUtils, 'safeClick').mockReturnValue(false)
      const res = await singleStep('download-csv', { csvButton: '#csv' })
      expect(res).toEqual({ success: true, message: 'ステップ群の実行が完了しました' })
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

  describe('応答とクリックの順序', () => {
    it('download-csv は応答を返してからクリックする', async () => {
      // 前のテストが予約した応答後のクリックを先に処理しておく
      await new Promise((resolve) => setTimeout(resolve, 0))

      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)

      const order: string[] = []
      const safeClickSpy = vi.spyOn(DomUtils, 'safeClick').mockImplementation(() => {
        order.push('click')
        return true
      })

      await sendMessage({
        action: 'execute-csv-download-steps',
        payload: { downloadSteps: ['download-csv'], selectors: { csvButton: '#csv' } },
      } as unknown as ChromeMessage).then(() => {
        order.push('response')
      })

      expect(safeClickSpy).not.toHaveBeenCalled()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(order).toEqual(['response', 'click'])
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

  describe('ログイン画面のパスキーボタン', () => {
    function sendCheckLoginState() {
      return sendMessage({ action: 'check-login-state' } as unknown as ChromeMessage)
    }

    function sendFetchStarted() {
      return sendMessage({ action: 'fetch-started' } as unknown as ChromeMessage)
    }

    function addPasskeyButton() {
      const button = document.createElement('button')
      button.id = 'login-passkey'
      document.body.appendChild(button)
      return button
    }

    it('check-login-state ではボタンをクリックしない（fetch-started でクリックするため）', async () => {
      document.body.innerHTML = '<input type="password" />'
      addPasskeyButton()
      const safeClick = vi.spyOn(DomUtils, 'safeClick')

      await sendCheckLoginState()
      await sendCheckLoginState()

      expect(safeClick).not.toHaveBeenCalled()
    })

    it('ログイン済みならボタンがあってもクリックしない', async () => {
      document.body.innerHTML = '<div>保有銘柄</div>'
      addPasskeyButton()
      const safeClick = vi.spyOn(DomUtils, 'safeClick')

      const res = await sendCheckLoginState()

      expect(res).toEqual({ success: true, loggedIn: true })
      expect(safeClick).not.toHaveBeenCalled()
    })

    it('fetch-started 受信後にボタンがあれば即座にクリックする', async () => {
      document.body.innerHTML = '<input type="password" />'
      const button = addPasskeyButton()
      const safeClick = vi.spyOn(DomUtils, 'safeClick')

      await sendFetchStarted()

      expect(safeClick).toHaveBeenCalledTimes(1)
      expect(safeClick).toHaveBeenCalledWith(button)
    })

    it('fetch-started 受信前にボタンが無く、後から出現したらクリックする', async () => {
      document.body.innerHTML = '<input type="password" />'
      const safeClick = vi.spyOn(DomUtils, 'safeClick')

      await sendFetchStarted()

      // ボタンが後から追加される
      const button = addPasskeyButton()

      expect(safeClick).toHaveBeenCalledTimes(1)
      expect(safeClick).toHaveBeenCalledWith(button)
    })

    it('fetch-started でクリック済みなら再クリックしない', async () => {
      document.body.innerHTML = '<input type="password" />'
      addPasskeyButton()
      const safeClick = vi.spyOn(DomUtils, 'safeClick')

      await sendFetchStarted()
      await sendFetchStarted()

      expect(safeClick).toHaveBeenCalledTimes(1)
    })
  })
})
