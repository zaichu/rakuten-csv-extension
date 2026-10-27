import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, CsvDownloadMessage, DownloadResponse } from '../types'
import { type StepTiming } from './downloadStepExecutor'
import {
  TEST_TAB_ID as TAB_ID,
  createTestExecutor as createExecutor,
  failWithChannelClosed,
  failWithContentScriptMissing,
  fireDownloadCreatedByUrl as fireDownloadCreated,
  fireTabReload,
  resetTestDoubles,
  sentSteps,
  silenceConsole,
  stubTabsSendMessage as setTabsSendMessageImpl,
} from '../tests/fixtures'

/**
 * downloadStepExecutor の通信失敗時の扱いを固定する。
 *
 * クリック後にページが破棄されると content script の応答が届かないが、
 * ダウンロードが始まっていれば取得は成立している。
 */

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

describe('次の要素の問い合わせ', () => {
  beforeEach(() => {
    silenceConsole()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetTestDoubles()
  })

  it.each(['未検出', 'content不在', '通信切れ', '応答なし'])(
    '遷移完了通知がなく、問い合わせが%sでも次の要素が出てから100ms以内に1回だけ進む',
    async (state) => {
      const executor = createExecutor()
      const startedAt = Date.now()
      const executed: string[] = []
      const queriedAt: number[] = []
      const reported: StepTiming[] = []
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (message.action === 'check-csv-download-step') {
          if (message.payload?.step === 'download-csv') {
            queriedAt.push(Date.now() - startedAt)
            if (Date.now() - startedAt < 250) {
              if (state === 'content不在') failWithContentScriptMissing(callback)
              else if (state === '通信切れ') failWithChannelClosed(callback)
              else if (state === '未検出') callback?.({ success: false })
              return
            }
          }
          callback?.({ success: true })
          return
        }
        executed.push(...sentSteps(message))
        if (sentSteps(message).includes('download-csv')) {
          executor.notifyDownloadClicked(TAB_ID, 0)
          fireDownloadCreated()
          callback?.({ success: true, contentTimings: [{ phase: 'button-found', durationMs: 0 }] })
          return
        }
        callback?.({ success: true })
      })

      const pending = executor.executeDownloadRequest(downloadRequest(), timing => reported.push(timing))
      await vi.advanceTimersByTimeAsync(249)
      expect(executed).toEqual(['navigate-to-page'])
      await vi.advanceTimersByTimeAsync(51)
      expect((await pending).success).toBe(true)
      expect(queriedAt).toEqual([0, 100, 200, 300])
      expect(executed).toEqual(['navigate-to-page', 'download-csv'])
      expect(reported.find(timing => timing.phase === 'button-found')?.durationMs).toBe(300)
      expect(chrome.tabs.reload).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(30000)
      expect(executed).toEqual(['navigate-to-page', 'download-csv'])
    }
  )

  it.each(['未検出', '応答なし'])('次の要素が%sのままなら従来のステップ上限で失敗し、前のクリックを繰り返さない', async (state) => {
    const executor = createExecutor()
    const executed: string[] = []
    let lateResponse: ((response: DownloadResponse) => void) | undefined
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step' && message.payload?.step === 'download-csv') {
        lateResponse = callback
        if (state === '未検出') callback?.({ success: false })
        return
      }
      executed.push(...sentSteps(message))
      callback?.({ success: true })
    })
    let settled = false
    const pending = executor.executeDownloadRequest(downloadRequest()).then(response => {
      settled = true
      return response
    })

    await vi.advanceTimersByTimeAsync(29999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).success).toBe(false)
    lateResponse?.({ success: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(executed).toEqual(['navigate-to-page'])
    expect(chrome.tabs.reload).not.toHaveBeenCalled()
  })

  it('問い合わせの応答が150msかかっても期限内の成功を見逃さない', async () => {
    const executor = createExecutor()
    const executed: string[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        setTimeout(() => callback?.({ success: true }), 150)
        return
      }
      executed.push(...sentSteps(message))
      if (sentSteps(message).includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
        callback?.({ success: true })
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).success).toBe(true)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
  })

  it('display-dataの後は更新待ちを挟んでからCSVを実行する', async () => {
    const executor = createExecutor()
    const sentAt = new Map<string, number>()
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        callback?.({ success: true })
        return
      }
      for (const step of sentSteps(message)) {
        if (!sentAt.has(step)) {
          sentAt.set(step, Date.now())
        }
      }
      if (sentSteps(message).includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(domesticStockRequest())
    await vi.advanceTimersByTimeAsync(5000)
    expect((await pending).success).toBe(true)
    expect(sentAt.get('display-data')).toBeDefined()
    expect(sentAt.get('download-csv')).toBeDefined()
    expect(sentAt.get('download-csv')! - sentAt.get('display-data')!).toBeGreaterThanOrEqual(300)
  })
})

describe('downloadStepExecutor の通信失敗時の扱い', () => {
  beforeEach(() => {
    silenceConsole()
  })

  afterEach(() => {
    resetTestDoubles()
  })

  it('成功応答でもダウンロード開始を観測できなければ失敗を返す', async () => {
    vi.useFakeTimers()
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(30000)
    const response = await pending

    expect(response.success).toBe(false)
    expect(response.error).toContain('ダウンロード開始を確認できませんでした')
    // 成功応答なのに開始を観測できない確定結果は送り直さない（再クリック防止）
    expect(downloadAttempts).toBe(1)
  })

  it.each([
    { responseType: 'success', expectedAttempts: 1 },
    { responseType: 'channel-closed', expectedAttempts: 1 },
  ])('無関係なURLだけでは開始を観測しない（$responseType）', async ({ responseType, expectedAttempts }) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
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
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(30000)
    expect((await pending).success).toBe(false)
    expect(downloadAttempts).toBe(expectedAttempts)
  })

  it.each([
    'https://www.rakuten-sec.co.jp/download.csv',
    'blob:https://www.rakuten-sec.co.jp/csv',
  ])('無関係なダウンロードの後も対象URLの開始を待ち続ける（%s）', async (url) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated('https://example.com/unrelated.zip')
        callback?.({ success: true })
        setTimeout(() => fireDownloadCreated(url), 1000)
        return
      }
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
    expect(vi.mocked(chrome.tabs.sendMessage).mock.calls.filter(call => (call[1] as ChromeMessage).action === 'execute-csv-download-steps')).toHaveLength(2)
  })

  it('通信に失敗してもダウンロード開始を観測していれば成功になる', async () => {
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
        failWithChannelClosed(callback)
        return
      }
      callback?.({ success: true })
    })

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response).toEqual({
      success: true,
      message: 'すべてのCSVダウンロードが完了しました',
    })
    // ダウンロード開始を観測できた時点でリトライしない（再クリックによる二重ダウンロード防止）
    expect(vi.mocked(chrome.tabs.sendMessage).mock.calls.filter(call => (call[1] as ChromeMessage).action === 'execute-csv-download-steps')).toHaveLength(2)
  })

  it('通信に失敗しダウンロードも始まらなければ再クリックせず失敗を返す', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (sentSteps(message).includes('download-csv')) {
          downloadAttempts += 1
          failWithChannelClosed(callback)
          return
        }
        callback?.({ success: true })
      })

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(30000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.error).toContain('コンテンツスクリプトとの通信に失敗')
      expect(downloadAttempts).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('実行の応答が空でも再クリックせず失敗を返す', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
      setTabsSendMessageImpl((_tabId, message, callback) => {
        if (sentSteps(message).includes('download-csv')) {
          downloadAttempts += 1
          callback?.(undefined as unknown as DownloadResponse)
          return
        }
        callback?.({ success: true })
      })

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(30000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.error).toContain('レスポンスがありません')
      expect(downloadAttempts).toBe(1)
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
      setTabsSendMessageImpl((_tabId, message, callback) => {
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
        callback?.({ success: true })
      })

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(10000)
      const response = await pending

      expect(response.success).toBe(false)
      expect(response.error).toContain('要素が見つかりませんでした')
      // contentが確定させた失敗は送り直さない（再クリック防止）
      expect(downloadAttempts).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('要素未検出の失敗では手順を送り直さない', async () => {
    const executor = createExecutor()
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).length === 0) {
        callback?.({ success: true })
        return
      }
      callback?.({
        success: false,
        error: '要素が見つかりませんでした: #missing',
        step: 'navigate-to-page',
      })
    })

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response.success).toBe(false)
    expect(response.error).toContain('要素が見つかりませんでした')
    expect(vi.mocked(chrome.tabs.sendMessage).mock.calls.filter(call => (call[1] as ChromeMessage).action === 'execute-csv-download-steps')).toHaveLength(1)
  })
})

describe('待ちの短縮とステップごとの計測', () => {
  beforeEach(() => {
    silenceConsole()
  })

  afterEach(() => {
    resetTestDoubles()
  })

  /** display-data が画面内の更新だけで済む（ページ遷移しない）国内株式の応答を返す */
  function stubDomesticStockWithoutDisplayTransition(): string[][] {
    const sent: string[][] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      const steps = sentSteps(message)
      if (steps.length === 0) {
        callback?.({ success: true })
        return
      }
      sent.push([...steps])
      if (steps.includes('download-csv')) {
        fireDownloadCreated()
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
    silenceConsole()
  })

  afterEach(() => {
    resetTestDoubles()
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

      setTabsSendMessageImpl((_tabId, message, callback) => {
        const steps = sentSteps(message)

        if (message.action === 'check-connection') {
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

  it('疎通確認が無応答でも上限で区切って再読み込みに進む', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      executor.notifyDownloadClicked(TAB_ID, 0)
      let connectionCheckCount = 0
      let stepAttempts = 0
      const reloadCount = { current: 0 }

      setTabsSendMessageImpl((_tabId, message, callback) => {
        const steps = sentSteps(message)

        if (message.action === 'check-connection') {
          connectionCheckCount += 1
          if (connectionCheckCount === 1) {
            return
          }
          callback?.({ success: true })
          return
        }

        if (steps.includes('download-csv')) {
          stepAttempts += 1
          executor.notifyDownloadClicked(TAB_ID, 0)
          fireDownloadCreated()
          callback?.({ success: true })
          return
        }

        callback?.({ success: true })
      })

      setupReloadMock(reloadCount)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(5000)
      const response = await pending

      expect(response.success).toBe(true)
      expect(connectionCheckCount).toBe(2)
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

      setTabsSendMessageImpl((_tabId, message, callback) => {
        const steps = sentSteps(message)

        if (message.action === 'check-connection') {
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

    setTabsSendMessageImpl((_tabId, message, callback) => {
      const steps = sentSteps(message)

      if (message.action === 'check-connection') {
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

      callback?.({ success: true })
    })

    setupReloadMock(reloadCount)

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response.success).toBe(true)
    expect(connectionCheckCount).toBe(1)
    expect(reloadCount.current).toBe(0)
  })

  it.each([false, true])('実行送信時にcontentが不在でも再読み込み・再クリックしない（開始通知: %s）', async (started) => {
    const executor = createExecutor()
    let downloadAttempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
        if (started) fireDownloadCreated()
        failWithContentScriptMissing(callback)
        return
      }
      callback?.({ success: true })
    })

    const response = await executor.executeDownloadRequest(downloadRequest())
    expect(response.success).toBe(false)
    expect(response.code).toBe('content-script-missing')
    expect(downloadAttempts).toBe(1)
    expect(chrome.tabs.reload).not.toHaveBeenCalled()
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
