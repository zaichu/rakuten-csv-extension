import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, CsvDownloadStep, DownloadResponse } from '../types'
import { RakutenUtils, DomUtils } from '../utils'
import { onExecute } from './rakutenContentScript'

/**
 * executeNavigateToPage / executeSelectTab / executeSelectPeriod /
 * executeDisplayData / executeDownloadCsv の現状挙動を固定する characterization test。
 * Issue #69 の統合リファクタ前後で無変更のまま全件パスすること。
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
      action: 'execute-csv-download',
      payload: { downloadType: 'dividend', downloadStep: step, selectors },
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
      expect(res).toEqual({ success: false, error: 'ページ遷移のセレクターが指定されていません' })
    })

    it('select-tab', async () => {
      const res = await singleStep('select-tab', {})
      expect(res).toEqual({ success: false, error: 'タブ選択のセレクターが指定されていません' })
    })

    it('select-period', async () => {
      const res = await singleStep('select-period', {})
      expect(res).toEqual({ success: false, error: '期間選択のセレクターが指定されていません' })
    })

    it('display-data', async () => {
      const res = await singleStep('display-data', {})
      expect(res).toEqual({ success: false, error: 'データ表示のセレクターが指定されていません' })
    })

    it('download-csv', async () => {
      const res = await singleStep('download-csv', {})
      expect(res).toEqual({ success: false, error: 'CSVダウンロードのセレクターが指定されていません' })
    })
  })

  describe('成功時のメッセージ', () => {
    it('navigate-to-page', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      document.body.appendChild(el)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({ success: true, message: 'ページ遷移が完了しました' })
    })

    it('select-tab', async () => {
      const el = document.createElement('a')
      el.id = 'tab'
      document.body.appendChild(el)
      const res = await singleStep('select-tab', { tabSelector: '#tab' })
      expect(res).toEqual({ success: true, message: 'タブ選択が完了しました' })
    })

    it('select-period', async () => {
      const el = document.createElement('input')
      el.id = 'period'
      document.body.appendChild(el)
      const res = await singleStep('select-period', { periodRadio: '#period' })
      expect(res).toEqual({ success: true, message: '期間選択が完了しました' })
    })

    it('display-data', async () => {
      const el = document.createElement('button')
      el.id = 'display'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await singleStep('display-data', { displayButton: '#display' })
      expect(res).toEqual({ success: true, message: 'データ表示が完了しました' })
    })

    it('download-csv', async () => {
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)
      const res = await singleStep('download-csv', { csvButton: '#csv' })
      expect(res).toEqual({ success: true, message: 'CSVダウンロードが完了しました' })
    })
  })

  describe('クリック失敗時のメッセージ', () => {
    it('navigate-to-page はクリック失敗エラーを返す', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      document.body.appendChild(el)
      vi.spyOn(DomUtils, 'safeClick').mockReturnValue(false)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({ success: false, error: 'ページ遷移のクリックに失敗しました' })
    })

    it('download-csv はクリック失敗エラーを返す', async () => {
      const el = document.createElement('button')
      el.id = 'csv'
      document.body.appendChild(el)
      makeInteractable(el)
      vi.spyOn(DomUtils, 'safeClick').mockReturnValue(false)
      const res = await singleStep('download-csv', { csvButton: '#csv' })
      expect(res).toEqual({ success: false, error: 'CSVダウンロードのクリックに失敗しました' })
    })
  })

  describe('requireInteractable の使い分け', () => {
    it('navigate系は非表示要素でも即時成功する', async () => {
      const el = document.createElement('a')
      el.id = 'menu-link'
      el.style.display = 'none'
      document.body.appendChild(el)
      const res = await singleStep('navigate-to-page', { menuLink: '#menu-link' })
      expect(res).toEqual({ success: true, message: 'ページ遷移が完了しました' })
    })

    it('display-data は要素不在でタイムアウトしリトライ応答を返す', async () => {
      vi.useFakeTimers()
      try {
        const pending = singleStep('display-data', { displayButton: '#missing-display' })
        await vi.advanceTimersByTimeAsync(6000)
        const res = await pending
        expect(res).toEqual({
          success: false,
          error: 'ステップ display-data の実行に失敗しました (リトライ 1/3)',
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
      expect(res).toEqual({ success: true, message: 'データ表示が完了しました' })
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
})
