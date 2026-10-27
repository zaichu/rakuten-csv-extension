import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, CsvDownloadStep, DownloadResponse } from '../types'
import { RakutenUtils, DomUtils } from '../utils'
import { silenceConsole, resetTestDoubles } from '../tests/fixtures'
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
    silenceConsole()
    document.body.innerHTML = ''
    vi.spyOn(RakutenUtils, 'isRakutenSecurities').mockReturnValue(true)
  })

  afterEach(() => {
    resetTestDoubles()
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
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('select-tab', async () => {
      const el = document.createElement('a')
      el.id = 'tab'
      document.body.appendChild(el)
      const res = await singleStep('select-tab', { tabSelector: '#tab' })
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('select-period', async () => {
      const el = document.createElement('input')
      el.id = 'period'
      document.body.appendChild(el)
      const res = await singleStep('select-period', { periodRadio: '#period' })
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('display-data', async () => {
      const el = document.createElement('button')
      el.id = 'display'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await singleStep('display-data', { displayButton: '#display' })
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('download-csv', async () => {
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await singleStep('download-csv', { csvButton: '#csv' })
      expect(res).toMatchObject({
        success: true,
        message: 'ステップ群の実行が完了しました',
      })
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
      expect(res).toMatchObject({
        success: true,
        message: 'ステップ群の実行が完了しました',
      })
    })
  })

  describe('requireInteractable の使い分け', () => {
    it('navigate系は非表示要素でも即時成功する', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      el.style.display = 'none'
      document.body.appendChild(el)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('display-data は要素不在でタイムアウトエラーを返す', async () => {
      vi.useFakeTimers()
      try {
        const pending = singleStep('display-data', { displayButton: '#missing-display' })
        await vi.advanceTimersByTimeAsync(16000)
        const res = await pending
        expect(res).toEqual({
          success: false,
          error: '要素が見つかりませんでした: #missing-display (15000ms)',
          step: 'display-data',
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('5秒を過ぎてから現れた要素も送り直さずに押せる', async () => {
      vi.useFakeTimers()
      try {
        const safeClick = vi.spyOn(DomUtils, 'safeClick')
        const pending = singleStep('display-data', { displayButton: '#late-slow' })
        await vi.advanceTimersByTimeAsync(7000)

        const el = document.createElement('button')
        el.id = 'late-slow'
        document.body.appendChild(el)
        makeInteractable(el)
        await vi.advanceTimersByTimeAsync(500)

        const res = await pending
        expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
        expect(safeClick).toHaveBeenCalledTimes(1)
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
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
    })

    it('後から現れた要素は上限を待たずにすぐ操作しクリックは1回だけ行う', async () => {
      const safeClick = vi.spyOn(DomUtils, 'safeClick')
      const startedAt = Date.now()
      const pending = singleStep('display-data', { displayButton: '#late-quick' })
      await new Promise((r) => setTimeout(r, 100))
      const el = document.createElement('button')
      el.id = 'late-quick'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await pending
      expect(res).toMatchObject({ success: true, message: 'ステップ群の実行が完了しました' })
      expect(Date.now() - startedAt).toBeLessThan(2000)
      expect(safeClick).toHaveBeenCalledTimes(1)
    })

    it('DOMの変化が無くても押せるようになった要素で成功する', async () => {
      vi.useFakeTimers()
      try {
        const el = document.createElement('button')
        el.id = 'late-csv'
        document.body.appendChild(el)

        let size = { width: 0, height: 0 }
        vi.spyOn(el, 'getBoundingClientRect').mockImplementation(
          () => ({
            width: size.width,
            height: size.height,
            top: 0,
            left: 0,
            bottom: size.height,
            right: size.width,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect
        )

        const pending = singleStep('display-data', { displayButton: '#late-csv' })
        await vi.advanceTimersByTimeAsync(500)

        // 属性は変えずに押せる状態にする（DOMの変化を待つ方式では気づけない）
        size = { width: 100, height: 30 }
        await vi.advanceTimersByTimeAsync(500)

        expect(await pending).toMatchObject({
          success: true,
          message: 'ステップ群の実行が完了しました',
        })
      } finally {
        vi.useRealTimers()
      }
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
      expect(res).toMatchObject({
        success: true,
        message: 'ステップ群の実行が完了しました',
      })
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

    function addPasskeyButton() {
      const button = document.createElement('button')
      button.id = 'login-passkey'
      document.body.appendChild(button)
      return button
    }

    it('ボタンが無ければクリックしない', async () => {
      document.body.innerHTML = '<input type="password" />'
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

    it('ボタンがあれば1回だけクリックする', async () => {
      document.body.innerHTML = '<input type="password" />'
      const button = addPasskeyButton()
      const safeClick = vi.spyOn(DomUtils, 'safeClick')

      // 同じページで2回検出してから押す仕様のため2回送る。
      // 前のテストで検出済みフラグが立っていると最初の1回で押される
      await sendCheckLoginState()
      await sendCheckLoginState()
      expect(safeClick).toHaveBeenCalledTimes(1)
      expect(safeClick).toHaveBeenCalledWith(button)

      // ダイアログをキャンセルしてボタンが残っていても再クリックしない
      await sendCheckLoginState()
      await sendCheckLoginState()
      expect(safeClick).toHaveBeenCalledTimes(1)
    })
  })
})
