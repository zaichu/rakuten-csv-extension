import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, CsvDownloadMessage, DownloadResponse } from '../types'
import { isPageTransitionStep } from '../types'
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

  it('問い合わせが返らなくても重ね打ちの同時滞留は上限以内で30秒で失敗する', async () => {
    const executor = createExecutor()
    const queriedAt: number[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        queriedAt.push(Date.now())
        return
      }
      callback?.({ success: true })
    })
    const pending = executor.executeDownloadRequest(downloadRequest())

    await vi.advanceTimersByTimeAsync(30000)
    expect((await pending).success).toBe(false)
    // 100ms間隔の送出を保つ
    expect(queriedAt.length).toBe(300)
    // 問い合わせ上限2sに対し100ms間隔のため同時滞留は20件以内
    let concurrent = 0
    for (const at of queriedAt) {
      const inWindow = queriedAt.filter((other) => other >= at && other - at < 2000).length
      concurrent = Math.max(concurrent, inWindow)
    }
    expect(concurrent).toBeLessThanOrEqual(20)
  })

  it('長く無応答が続いた後に要素が出ても100ms以内に進む', async () => {
    const executor = createExecutor()
    const executed: string[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        if (message.payload?.step === 'download-csv') {
          if (Date.now() >= 2500) {
            callback?.({ success: true })
          }
          return
        }
        callback?.({ success: true })
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

    let settled = false
    const pending = executor.executeDownloadRequest(downloadRequest()).then((response) => {
      settled = true
      return response
    })
    await vi.advanceTimersByTimeAsync(2600)
    expect(settled).toBe(true)
    expect((await pending).success).toBe(true)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
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

  it('送信で例外が起きてもダウンロード開始を観測していれば成功になる', async () => {
    const executor = createExecutor()
    executor.notifyDownloadClicked(TAB_ID, 0)
    let downloadAttempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
        throw new Error('送信に失敗しました')
      }
      callback?.({ success: true })
    })

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response).toEqual({
      success: true,
      message: 'すべてのCSVダウンロードが完了しました',
    })
    expect(downloadAttempts).toBe(1)
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

  it.each(['display-data', 'download-csv'])('要素検出後の%sの実行指示が未達なら、要素を待ち直して再送する', async (step) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    const events: string[] = []
    let attempts = 0
    let elementChecks = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step' && message.payload?.step === step) {
        elementChecks += 1
        events.push('check')
        callback?.({ success: attempts === 0 || elementChecks >= 3 })
        return
      }
      if (sentSteps(message).includes(step)) {
        attempts += 1
        events.push('execute')
        if (attempts === 1) {
          failWithContentScriptMissing(callback)
          return
        }
      }
      if (sentSteps(message).includes('download-csv')) {
        expect(chrome.downloads.onCreated.addListener).toHaveBeenCalledTimes(1)
        executor.notifyDownloadClicked(TAB_ID, 0)
        fireDownloadCreated()
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(domesticStockRequest())
    await vi.advanceTimersByTimeAsync(1000)

    expect((await pending).success).toBe(true)
    expect(attempts).toBe(2)
    expect(events).toEqual(['check', 'execute', 'check', 'check', 'execute'])
    expect(chrome.downloads.onCreated.addListener).toHaveBeenCalledTimes(1)
    expect(chrome.downloads.onCreated.removeListener).toHaveBeenCalledTimes(1)
    expect(chrome.tabs.reload).not.toHaveBeenCalled()
  })

  it.each(['display-data', 'download-csv'])('%sの実行指示でmessage port closedが返ったら再送しない', async (step) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    let attempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes(step)) {
        attempts += 1
        const runtime = chrome.runtime as unknown as { lastError?: { message: string } }
        runtime.lastError = { message: 'The message port closed before a response was received.' }
        callback?.({ success: false })
        delete runtime.lastError
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(domesticStockRequest())
    await vi.advanceTimersByTimeAsync(30000)
    const response = await pending

    expect(response.success).toBe(false)
    expect(response.error).toContain('message port closed before a response was received')
    expect(response.code).toBeUndefined()
    expect(attempts).toBe(1)
  })

  it.each([
    { retryDelay: 11000, communicationFailed: false, startDelay: 0, success: true },
    { retryDelay: 11000, communicationFailed: false, startDelay: 7000, success: true },
    { retryDelay: 11000, communicationFailed: false, startDelay: 11000, success: false },
    { retryDelay: 11000, communicationFailed: true, startDelay: 0, success: true },
    { retryDelay: 28000, communicationFailed: false, startDelay: 7000, success: true },
  ])('未達後$retryDelay msで再送したCSVの開始を監視する（通信切れ: $communicationFailed、開始遅延: $startDelay）', async ({ retryDelay, communicationFailed, startDelay, success }) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    const startedAt = Date.now()
    const listeners = new Set<(item: chrome.downloads.DownloadItem) => void>()
    vi.spyOn(chrome.downloads.onCreated, 'addListener').mockImplementation(listener => {
      listeners.add(listener)
    })
    vi.spyOn(chrome.downloads.onCreated, 'removeListener').mockImplementation(listener => {
      listeners.delete(listener)
    })
    let attempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step' && message.payload?.step === 'download-csv') {
        callback?.({ success: attempts === 0 || Date.now() - startedAt >= retryDelay })
        return
      }
      if (sentSteps(message).includes('download-csv')) {
        attempts += 1
        if (attempts === 1) {
          failWithContentScriptMissing(callback)
          return
        }
        expect(listeners.size).toBe(1)
        executor.notifyDownloadClicked(TAB_ID, 0)
        setTimeout(() => {
          for (const listener of listeners) {
            listener({ url: 'https://www.rakuten-sec.co.jp/download.csv' } as chrome.downloads.DownloadItem)
          }
        }, startDelay)
        if (communicationFailed) {
          failWithChannelClosed(callback)
          return
        }
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(10001)
    expect(listeners.size).toBe(1)
    await vi.advanceTimersByTimeAsync(retryDelay + 11000 - 10001)
    const response = await pending

    expect(response.success).toBe(success)
    if (!success) expect(response.error).toContain('ダウンロード開始を確認できませんでした')
    expect(attempts).toBe(2)
    expect(chrome.downloads.onCreated.addListener).toHaveBeenCalledTimes(1)
    expect(chrome.downloads.onCreated.removeListener).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })

  it.each(['要素あり', '要素なし'])('実行指示が期限まで未達ならcontent-script-missingを返す（再確認: %s）', async (elementState) => {
    vi.useFakeTimers()
    const executor = createExecutor()
    let downloadAttempts = 0
    let settled = false
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step' && message.payload?.step === 'download-csv') {
        callback?.({ success: downloadAttempts === 0 || elementState === '要素あり' })
        return
      }
      if (sentSteps(message).includes('download-csv')) {
        downloadAttempts += 1
        setTimeout(() => failWithContentScriptMissing(callback), 100)
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest()).then(response => {
      settled = true
      return response
    })
    await vi.advanceTimersByTimeAsync(29999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const response = await pending

    expect(response.success).toBe(false)
    expect(response.code).toBe('content-script-missing')
    expect(response.error).toContain('Receiving end does not exist')
    expect(downloadAttempts).toBe(elementState === '要素あり' ? 300 : 1)
    expect(chrome.downloads.onCreated.addListener).toHaveBeenCalledTimes(1)
    expect(chrome.downloads.onCreated.removeListener).toHaveBeenCalledTimes(1)
    const attemptsAtDeadline = downloadAttempts
    await vi.advanceTimersByTimeAsync(30000)
    expect(downloadAttempts).toBe(attemptsAtDeadline)
    expect(chrome.tabs.reload).not.toHaveBeenCalled()
  })

})

describe('ダウンロード開始待ちの上限', () => {
  beforeEach(() => {
    silenceConsole()
  })

  afterEach(() => {
    resetTestDoubles()
  })

  function stubWithDelayedStart(delayMs: number, url?: string): void {
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        callback?.({ success: true })
        return
      }
      if (sentSteps(message).includes('download-csv')) {
        setTimeout(() => fireDownloadCreated(url), delayMs)
        callback?.({ success: true })
        return
      }
      callback?.({ success: true })
    })
  }

  it('開始が5秒以内なら成功する', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      executor.notifyDownloadClicked(TAB_ID, 0)
      stubWithDelayedStart(4000)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(5000)
      expect((await pending).success).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('開始が5〜10秒でも成功する', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      executor.notifyDownloadClicked(TAB_ID, 0)
      stubWithDelayedStart(7000)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(8000)
      expect((await pending).success).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('開始が10秒を超えると失敗する', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      executor.notifyDownloadClicked(TAB_ID, 0)
      stubWithDelayedStart(11000)

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(30000)
      const response = await pending
      expect(response.success).toBe(false)
      expect(response.error).toContain('ダウンロード開始を確認できませんでした')
    } finally {
      vi.useRealTimers()
    }
  })

  it('別ファイルの開始では成功にしない', async () => {
    vi.useFakeTimers()
    try {
      const executor = createExecutor()
      executor.notifyDownloadClicked(TAB_ID, 0)
      stubWithDelayedStart(1000, 'https://example.com/unrelated.zip')

      const pending = executor.executeDownloadRequest(downloadRequest())
      await vi.advanceTimersByTimeAsync(30000)
      const response = await pending
      expect(response.success).toBe(false)
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

  it('全ステップで単独グルーピングと isPageTransitionStep が一致する', () => {
    const steps = ['navigate-to-page', 'select-tab', 'select-period', 'display-data', 'download-csv'] as const
    for (const step of steps) {
      if (isPageTransitionStep(step)) {
        expect(createExecutor().groupSteps([step])).toEqual([{ kind: 'page-transition', step }])
      } else {
        expect(createExecutor().groupSteps([step])).toEqual([{ kind: 'batch', steps: [step] }])
      }
    }
  })

  it('遷移系は navigate-to-page と select-tab と display-data', () => {
    expect(isPageTransitionStep('navigate-to-page')).toBe(true)
    expect(isPageTransitionStep('select-tab')).toBe(true)
    expect(isPageTransitionStep('display-data')).toBe(true)
    expect(isPageTransitionStep('select-period')).toBe(false)
    expect(isPageTransitionStep('download-csv')).toBe(false)
  })
})
