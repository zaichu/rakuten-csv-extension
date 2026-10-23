import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CsvDownloadMessage, DownloadResponse } from '../types'
import { DownloadStepExecutor, type TabStateReader } from './downloadStepExecutor'

/**
 * downloadStepExecutor の通信失敗時の扱いを固定する。
 *
 * クリック後にページが破棄されると content script の応答が届かないが、
 * ダウンロードが始まっていれば取得は成立している。
 */

const TAB_ID = 42

type SendMessageImpl = (
  tabId: number,
  message: { action: string; payload?: Record<string, unknown> },
  callback?: (response: DownloadResponse) => void
) => void

function createExecutor(): DownloadStepExecutor {
  const tabState: TabStateReader = {
    hasRakutenTab: () => true,
    getActiveTabId: () => TAB_ID,
  }
  return new DownloadStepExecutor(tabState)
}

function downloadRequest(): CsvDownloadMessage {
  return {
    action: 'download-csv-request',
    payload: { selectedOptions: ['assetbalance'], tabId: TAB_ID },
  }
}

function setTabsSendMessageImpl(impl: SendMessageImpl): void {
  const mock = chrome.tabs.sendMessage as unknown as {
    mockImplementation: (fn: SendMessageImpl) => void
  }
  mock.mockImplementation(impl)
}

function sentSteps(message: { payload?: Record<string, unknown> }): readonly string[] {
  return (message.payload?.['downloadSteps'] as readonly string[] | undefined) ?? []
}

/** ページ遷移完了イベントを発火させ、waitForPageTransition の待ちを解消する */
function firePageTransition(tabId: number): void {
  const addListener = chrome.tabs.onUpdated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (id: number, changeInfo: { status?: string }) => void
    listener(tabId, { status: 'complete' })
  }
}

/** ダウンロード開始イベントを発火させ、waitForDownloadStart の待ちを解消する */
function fireDownloadCreated(url = 'https://www.rakuten-sec.co.jp/download.csv'): void {
  const addListener = chrome.downloads.onCreated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (item: Pick<chrome.downloads.DownloadItem, 'url'>) => void
    listener({ url })
  }
}

/** content script がページ破棄で応答を返せなかった状況を再現する */
function failWithChannelClosed(callback?: (response: DownloadResponse) => void): void {
  const runtime = chrome.runtime as unknown as { lastError?: { message: string } }
  runtime.lastError = {
    message: 'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
  }
  callback?.({ success: false, error: 'レスポンスがありません' })
  delete runtime.lastError
}

describe('downloadStepExecutor の通信失敗時の扱い', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('成功応答でもダウンロード開始を観測できなければ失敗を返す', async () => {
    vi.useFakeTimers()
    const executor = createExecutor()
    let downloadAttempts = 0
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
      } else {
        firePageTransition(tabId)
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(30000)
    const response = await pending

    expect(response.success).toBe(false)
    expect(response.error).toContain('ダウンロード開始を確認できませんでした')
    expect(downloadAttempts).toBe(3)
  })

  it.each(['success', 'channel-closed'])('無関係なURLだけでは開始を観測しない（%s）', async (responseType) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    let downloadAttempts = 0
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
        fireDownloadCreated('https://example.com/unrelated.zip')
        if (responseType === 'channel-closed') {
          failWithChannelClosed(callback)
        } else {
          callback?.({ success: true })
        }
        return
      }
      firePageTransition(tabId)
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(30000)
    expect((await pending).success).toBe(false)
    expect(downloadAttempts).toBe(3)
  })

  it.each([
    'https://www.rakuten-sec.co.jp/download.csv',
    'blob:https://www.rakuten-sec.co.jp/csv',
    'data:text/csv,test',
  ])('無関係なダウンロードの後も対象URLの開始を待ち続ける（%s）', async (url) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        fireDownloadCreated('https://example.com/unrelated.zip')
        callback?.({ success: true })
        setTimeout(() => fireDownloadCreated(url), 1000)
        return
      }
      firePageTransition(tabId)
      callback?.({ success: true })
    })

    let settled = false
    const pending = executor.executeDownloadRequest(downloadRequest()).then((response) => {
      settled = true
      return response
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(settled).toBe(false)
    expect(chrome.downloads.onCreated.removeListener).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect((await pending).success).toBe(true)
    expect(chrome.downloads.onCreated.removeListener).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('通信に失敗してもダウンロード開始を観測していれば成功になる', async () => {
    const executor = createExecutor()
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        fireDownloadCreated()
        failWithChannelClosed(callback)
        return
      }
      firePageTransition(tabId)
      callback?.({ success: true })
    })

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response).toEqual({
      success: true,
      message: 'すべてのCSVダウンロードが完了しました',
    })
    // ダウンロード開始を観測できた時点でリトライしない（再クリックによる二重ダウンロード防止）
    expect(vi.mocked(chrome.tabs.sendMessage).mock.calls).toHaveLength(2)
  })

  it('通信に失敗しダウンロードも始まらなければリトライし、失敗を返す', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      let downloadAttempts = 0
      setTabsSendMessageImpl((tabId, message, callback) => {
        if (sentSteps(message).includes('download-csv')) {
          downloadAttempts += 1
          failWithChannelClosed(callback)
          return
        }
        firePageTransition(tabId)
        callback?.({ success: true })
      })

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(30000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.error).toContain('コンテンツスクリプトとの通信に失敗')
      expect(response.error).toContain('3回試行')
      expect(downloadAttempts).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('コンテンツスクリプトが返した失敗はダウンロード開始を観測しても失敗のまま', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      let downloadAttempts = 0
      setTabsSendMessageImpl((tabId, message, callback) => {
        if (sentSteps(message).includes('download-csv')) {
          downloadAttempts += 1
          fireDownloadCreated()
          callback?.({
            success: false,
            error: '要素が見つかりませんでした: #missing',
            step: 'download-csv',
          })
          return
        }
        firePageTransition(tabId)
        callback?.({ success: true })
      })

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(10000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.error).toContain('要素が見つかりませんでした')
      expect(downloadAttempts).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
