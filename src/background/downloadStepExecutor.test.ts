import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, CsvDownloadMessage, DownloadResponse } from '../types'
import { isPageTransitionStep } from '../types'
import { type StepTiming } from './downloadStepExecutor'
import {
  TEST_TAB_ID as TAB_ID,
  createTestExecutor as createExecutor,
  failWithChannelClosed,
  failWithContentScriptMissing,
  fireTabReload,
  resetTestDoubles,
  sentSteps,
  silenceConsole,
  stubTabsSendMessage as setTabsSendMessageImpl,
} from '../tests/fixtures'

/** downloadStepExecutor の通信失敗時の扱いを固定する。 */

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

describe('遷移直後の古いページの応答', () => {
  beforeEach(() => {
    silenceConsole()
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetTestDoubles()
  })

  it('古いdocument IDの応答では実行せず、新しいIDで実行する', async () => {
    const executor = createExecutor()
    const startedAt = Date.now()
    const executed: string[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        if (message.payload?.step === 'download-csv') {
          callback?.({ success: true, documentId: Date.now() - startedAt < 500 ? 'doc-old' : 'doc-new' })
          return
        }
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      executed.push(...sentSteps(message))
      if (sentSteps(message).includes('navigate-to-page')) {
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      if (sentSteps(message).includes('download-csv')) {
        callback?.({ success: true, documentId: 'doc-new' })
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(400)
    expect(executed).toEqual(['navigate-to-page'])
    await vi.advanceTimersByTimeAsync(200)
    expect((await pending).success).toBe(true)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
    await vi.advanceTimersByTimeAsync(30000)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
  })

  it('遷移が起きないときは上限で同じIDでも進む', async () => {
    const executor = createExecutor()
    const executed: string[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      executed.push(...sentSteps(message))
      if (sentSteps(message).includes('navigate-to-page')) {
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      if (sentSteps(message).includes('download-csv')) {
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(2900)
    expect(executed).toEqual(['navigate-to-page'])
    await vi.advanceTimersByTimeAsync(500)
    expect((await pending).success).toBe(true)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
  })

  it('遷移系ステップの実行応答にIDがなくても問い合わせのIDで古いページを見分ける', async () => {
    const executor = createExecutor()
    const startedAt = Date.now()
    const executed: string[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        if (message.payload?.step === 'download-csv') {
          callback?.({ success: true, documentId: Date.now() - startedAt < 500 ? 'doc-old' : 'doc-new' })
          return
        }
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      executed.push(...sentSteps(message))
      if (sentSteps(message).includes('navigate-to-page')) {
        callback?.({ success: true })
        return
      }
      if (sentSteps(message).includes('download-csv')) {
        callback?.({ success: true, documentId: 'doc-new' })
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(400)
    expect(executed).toEqual(['navigate-to-page'])
    await vi.advanceTimersByTimeAsync(200)
    expect((await pending).success).toBe(true)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
    await vi.advanceTimersByTimeAsync(30000)
    expect(executed).toEqual(['navigate-to-page', 'download-csv'])
  })

  it('遷移系ステップの実行応答が通信切れでも次の実行指示を送らず失敗する', async () => {
    const executor = createExecutor()
    const executed: string[] = []
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step') {
        callback?.({ success: true, documentId: 'doc-old' })
        return
      }
      executed.push(...sentSteps(message))
      if (sentSteps(message).includes('navigate-to-page')) {
        failWithChannelClosed(callback)
        return
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(downloadRequest())
    await vi.advanceTimersByTimeAsync(1000)
    const response = await pending
    expect(response.success).toBe(false)
    expect(response.error).toContain('コンテンツスクリプトとの通信に失敗')
    expect(executed).toEqual(['navigate-to-page'])
    await vi.advanceTimersByTimeAsync(30000)
    expect(executed).toEqual(['navigate-to-page'])
  })
})

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

describe('downloadStepExecutor のステップ実行結果', () => {
  beforeEach(() => silenceConsole())
  afterEach(() => resetTestDoubles())

  it('download-csv の成功応答でシーケンスが成功する', async () => {
    const executor = createExecutor()
    setTabsSendMessageImpl((_tabId, _message, callback) => callback?.({ success: true }))

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response.success).toBe(true)
  })

  it('content script の失敗理由を保持し、手順を再送しない', async () => {
    const executor = createExecutor()
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('download-csv')) {
        callback?.({ success: false, error: 'CSV取得に失敗しました', step: 'download-csv' })
        return
      }
      callback?.({ success: true })
    })

    const response = await executor.executeDownloadRequest(downloadRequest())

    expect(response.success).toBe(false)
    expect(response.error).toContain('CSV取得に失敗しました')
    expect(vi.mocked(chrome.tabs.sendMessage).mock.calls.filter((call) =>
      sentSteps(call[1] as ChromeMessage).includes('download-csv')
    )).toHaveLength(1)
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

  it('要素検出後のdisplay-dataの実行指示が未達なら、要素を待ち直して再送する', async () => {
    vi.useFakeTimers()
    const executor = createExecutor()
    const events: string[] = []
    let attempts = 0
    let elementChecks = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (message.action === 'check-csv-download-step' && message.payload?.step === 'display-data') {
        elementChecks += 1
        events.push('check')
        callback?.({ success: attempts === 0 || elementChecks >= 3 })
        return
      }
      if (sentSteps(message).includes('display-data')) {
        attempts += 1
        events.push('execute')
        if (attempts === 1) {
          failWithContentScriptMissing(callback)
          return
        }
      }
      callback?.({ success: true })
    })

    const pending = executor.executeDownloadRequest(domesticStockRequest())
    await vi.advanceTimersByTimeAsync(1000)

    expect((await pending).success).toBe(true)
    expect(attempts).toBe(2)
    expect(events).toEqual(['check', 'execute', 'check', 'check', 'execute'])
    expect(chrome.tabs.reload).not.toHaveBeenCalled()
  })

  it('display-data の実行指示でmessage port closedが返ったら再送しない', async () => {
    vi.useFakeTimers()
    const executor = createExecutor()
    let attempts = 0
    setTabsSendMessageImpl((_tabId, message, callback) => {
      if (sentSteps(message).includes('display-data')) {
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
    const attemptsAtDeadline = downloadAttempts
    await vi.advanceTimersByTimeAsync(30000)
    expect(downloadAttempts).toBe(attemptsAtDeadline)
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
