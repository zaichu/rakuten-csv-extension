import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CsvDownloadMessage, DownloadResponse } from '../types'
import {
  DownloadStepExecutor,
  type StepTiming,
} from './downloadStepExecutor'

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
  return new DownloadStepExecutor({
    hasRakutenTab: () => true,
    getActiveTabId: () => TAB_ID,
  })
}

function downloadRequest(): CsvDownloadMessage {
  return {
    action: 'download-csv-request',
    payload: { selectedOptions: ['assetbalance'], tabId: TAB_ID },
  }
}

function domesticStockRequest(): CsvDownloadMessage {
  return {
    action: 'download-csv-request',
    payload: { selectedOptions: ['domesticstock'], tabId: TAB_ID },
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

/** コンテンツスクリプトが存在しないエラーを再現する */
function failWithContentScriptMissing(callback?: (response: DownloadResponse) => void): void {
  const runtime = chrome.runtime as unknown as { lastError?: { message: string } }
  runtime.lastError = {
    message: 'Could not establish connection. Receiving end does not exist',
  }
  callback?.({ success: false, error: 'レスポンスがありません' })
  delete runtime.lastError
}

/** タブ再読み込み完了イベントを発火させる */
function fireTabReload(tabId: number): void {
  const addListener = chrome.tabs.onUpdated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (id: number, changeInfo: { status?: string }) => void
    listener(tabId, { status: 'complete' })
  }
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
    executor.notifyDownloadClicked(TAB_ID, 0)
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
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
        fireDownloadCreated('https://example.com/unrelated.zip')
        fireDownloadCreated('blob:https://example.com/unrelated')
        fireDownloadCreated('data:text/csv,test')
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
  ])('無関係なダウンロードの後も対象URLの開始を待ち続ける（%s）', async (url) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
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
    // 接続確認(1) + navigate-to-page(1) + download-csv(1) = 3回
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(3)
  })

  it('通信に失敗してもダウンロード開始を観測していれば成功になる', async () => {
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    setTabsSendMessageImpl((tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
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
    // 接続確認(1) + navigate-to-page(1) + download-csv(1) = 3回
    expect(vi.mocked(chrome.tabs.sendMessage).mock.calls).toHaveLength(3)
  })

  it('通信に失敗しダウンロードも始まらなければリトライし、失敗を返す', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
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
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
      setTabsSendMessageImpl((tabId, message, callback) => {
        if (sentSteps(message).includes('download-csv')) {
          downloadAttempts += 1
          executor.notifyDownloadClicked(TAB_ID, 0)
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

describe('待ちの短縮とステップごとの計測', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** display-data が画面内の更新だけで済む（ページ遷移しない）国内株式の応答を返す */
  function stubDomesticStockWithoutDisplayTransition(): string[][] {
    const sent: string[][] = []
    setTabsSendMessageImpl((tabId, message, callback) => {
      const steps = sentSteps(message)
      if (steps.length === 0) {
        callback?.({ success: true })
        return
      }
      sent.push([...steps])
      if (steps.includes('download-csv')) {
        fireDownloadCreated()
      } else if (steps.includes('navigate-to-page')) {
        firePageTransition(tabId)
      }
      callback?.({
        success: true,
        receivedAt: Date.now(),
        contentTimings: [
          { phase: 'button-found', durationMs: 1 },
        ],
      })
    })
    return sent
  }

  it('遷移しないステップは待ちの上限まで待たずに次へ進む', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    executor.notifyDownloadClicked(TAB_ID, 3)
      const sent = stubDomesticStockWithoutDisplayTransition()

      const pending = executor.executeDownloadRequest(domesticStockRequest())
      // ページ遷移の上限は3000ms。遷移しない表示ステップでそれを待たないことを確かめる
      await vi.advanceTimersByTimeAsync(1000)
      const response = await pending

      expect(response.success).toBe(true)
      expect(sent).toEqual([
        ['navigate-to-page'],
        ['select-period'],
        ['display-data'],
        ['download-csv'],
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ステップごとの所要時間をステップの順に報告する', async () => {
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    executor.notifyDownloadClicked(TAB_ID, 3)
    stubDomesticStockWithoutDisplayTransition()

    const reported: StepTiming[] = []
    const response = await executor.executeDownloadRequest(domesticStockRequest(), (timing) => {
      reported.push(timing)
    })

    expect(response.success).toBe(true)
    expect(reported.map((timing) => `${timing.step}:${timing.phase}`)).toEqual([
      'navigate-to-page:action',
      'select-period:action',
      'display-data:action',
      'download-csv:receive',
      'download-csv:button-found',
      'download-csv:click',
      'download-csv:download-start',
    ])
    expect(reported.every((timing) => timing.durationMs >= 0)).toBe(true)
  })
})

describe('コンテンツスクリプト不在時の再読み込み処理', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function setupReloadMock(reloadCount: { current: number }): void {
    vi.mocked(chrome.tabs.reload).mockImplementation((tabId?: number, _reloadProperties?: unknown, callback?: () => void) => {
      reloadCount.current += 1
      // 非同期で完了イベントを発火
      if (tabId !== undefined) {
        setTimeout(() => fireTabReload(tabId), 0)
      }
      if (callback) {
        setTimeout(callback, 0)
      }
    })
  }

  it('接続エラーでタブを再読み込みし、再試行で成功する', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let connectionCheckCount = 0
      let stepAttempts = 0
      const reloadCount = { current: 0 }

      setTabsSendMessageImpl((tabId, message, callback) => {
        const steps = sentSteps(message)

        // 接続確認メッセージ（downloadSteps が空）
        if (steps.length === 0) {
          connectionCheckCount += 1
          if (connectionCheckCount === 1) {
            // 1回目の接続確認は失敗
            failWithContentScriptMissing(callback)
            return
          }
          // 再読み込み後の接続確認は成功
          callback?.({ success: true })
          return
        }

        // ステップ実行
        if (steps.includes('download-csv')) {
          stepAttempts += 1
          executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
          callback?.({ success: true })
          return
        }

        firePageTransition(tabId)
        callback?.({ success: true })
      })

      setupReloadMock(reloadCount)

      const pending = executor.executeDownloadRequest(downloadRequest())
      // 接続確認失敗 → 再読み込み待ち → 再接続確認 → ステップ実行
      await vi.advanceTimersByTimeAsync(1000)
      const response = await pending

      expect(response.success).toBe(true)
      expect(connectionCheckCount).toBe(2) // 初回失敗 + 再読み込み後成功
      expect(reloadCount.current).toBe(1)
      expect(stepAttempts).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('再読み込み後も接続できなければ content-script-missing エラーを返す', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let connectionCheckCount = 0
      const reloadCount = { current: 0 }

      setTabsSendMessageImpl((tabId, message, callback) => {
        const steps = sentSteps(message)

        if (steps.length === 0) {
          connectionCheckCount += 1
          // 常に接続失敗
          failWithContentScriptMissing(callback)
          return
        }

        if (steps.includes('download-csv')) {
          executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
          callback?.({ success: true })
          return
        }

        firePageTransition(tabId)
        callback?.({ success: true })
      })

      setupReloadMock(reloadCount)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(1000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.code).toBe('content-script-missing')
      expect(response.error).toContain('楽天証券のタブを再読み込みしてください')
      expect(connectionCheckCount).toBe(2) // 初回 + 再読み込み後
      expect(reloadCount.current).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('初回接続確認が成功すれば再読み込みしない', async () => {
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let connectionCheckCount = 0
    const reloadCount = { current: 0 }

    setTabsSendMessageImpl((tabId, message, callback) => {
      const steps = sentSteps(message)

      if (steps.length === 0) {
        connectionCheckCount += 1
        // 初回接続確認は成功
        callback?.({ success: true })
        return
      }

      if (steps.includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
        callback?.({ success: true })
        return
      }

      firePageTransition(tabId)
      callback?.({ success: true })
    })

    setupReloadMock(reloadCount)

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response.success).toBe(true)
    expect(connectionCheckCount).toBe(1)
    expect(reloadCount.current).toBe(0)
  })

  it('ステップ実行中にコンテンツスクリプト不在になれば再読み込みして再試行する', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let stepAttempts = 0
      const reloadCount = { current: 0 }

      setTabsSendMessageImpl((tabId, message, callback) => {
        const steps = sentSteps(message)

        if (steps.length === 0) {
          // 接続確認は成功
          callback?.({ success: true })
          return
        }

        if (steps.includes('download-csv')) {
          stepAttempts += 1
          if (stepAttempts === 1) {
            // 1回目はコンテンツスクリプト不在
            failWithContentScriptMissing(callback)
            return
          }
          // 再読み込み後は成功
          executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
          callback?.({ success: true })
          return
        }

        firePageTransition(tabId)
        callback?.({ success: true })
      })

      setupReloadMock(reloadCount)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(1000)
      const response = await pending

      expect(response.success).toBe(true)
      expect(stepAttempts).toBe(2) // 初回失敗 + 再試行成功
      expect(reloadCount.current).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ステップ実行中の再読み込み後も失敗すれば content-script-missing を返す', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let stepAttempts = 0
      const reloadCount = { current: 0 }

      setTabsSendMessageImpl((tabId, message, callback) => {
        const steps = sentSteps(message)

        if (steps.length === 0) {
          callback?.({ success: true })
          return
        }

        if (steps.includes('download-csv')) {
          stepAttempts += 1
          // 常にコンテンツスクリプト不在
          failWithContentScriptMissing(callback)
          return
        }

        firePageTransition(tabId)
        callback?.({ success: true })
      })

      setupReloadMock(reloadCount)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(1000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.code).toBe('content-script-missing')
      expect(stepAttempts).toBe(2) // 初回 + 再試行
      expect(reloadCount.current).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('groupSteps のグルーピングロジック', () => {
  it('navigate-to-page/select-tab/display-data は単独の page-transition グループになる', () => {
    const executor = createExecutor()
    expect(executor.groupSteps(['navigate-to-page'])).toEqual([
      { kind: 'page-transition', step: 'navigate-to-page' },
    ])
    expect(executor.groupSteps(['select-tab'])).toEqual([
      { kind: 'page-transition', step: 'select-tab' },
    ])
    expect(executor.groupSteps(['display-data'])).toEqual([
      { kind: 'page-transition', step: 'display-data' },
    ])
  })

  it('それ以外の連続ステップは1つの batch グループにまとまる', () => {
    expect(createExecutor().groupSteps(['select-period', 'download-csv'])).toEqual([
      { kind: 'batch', steps: ['select-period', 'download-csv'] },
    ])
  })

  it('dividend のステップ列は page-transition と batch が交互になる', () => {
    expect(
      createExecutor().groupSteps(['navigate-to-page', 'select-period', 'display-data', 'download-csv'])
    ).toEqual([
      { kind: 'page-transition', step: 'navigate-to-page' },
      { kind: 'batch', steps: ['select-period'] },
      { kind: 'page-transition', step: 'display-data' },
      { kind: 'batch', steps: ['download-csv'] },
    ])
  })

  it('mutualfund のステップ列は select-tab も単独グループになる', () => {
    expect(
      createExecutor().groupSteps([
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
    expect(createExecutor().groupSteps([])).toEqual([])
  })
})
