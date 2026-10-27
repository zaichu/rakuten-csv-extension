import { vi } from 'vitest'
import type { DownloadResponse } from '../types'
import { DownloadStepExecutor } from '../background/downloadStepExecutor'

/**
 * 背景系テストの定型準備
 *
 * console の黙らせ・executor の組み立て・送信スタブの繰り返しを寄せる。
 * 各テストの意図は呼び出し側の名前で読めるよう、汎用名にしない。
 */

export const TEST_TAB_ID = 42

/** console の出力を黙らせる(beforeEach 内で呼ぶ) */
export function silenceConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

/** モックとタイマーを元に戻す(afterEach 内で呼ぶ) */
export function resetTestDoubles(): void {
  vi.restoreAllMocks()
  vi.useRealTimers()
}

export type TabsSendMessageImpl = (
  tabId: number,
  message: { action: string; payload?: Record<string, unknown> },
  callback?: (response: DownloadResponse) => void
) => void

/** chrome.tabs.sendMessage の差し替え */
export function stubTabsSendMessage(impl: TabsSendMessageImpl): void {
  const mock = chrome.tabs.sendMessage as unknown as {
    mockImplementation: (fn: TabsSendMessageImpl) => void
  }
  mock.mockImplementation(impl)
}

/** 送信された execute-csv-download-steps のステップ列を取り出す */
export function sentSteps(message: { payload?: Record<string, unknown> }): readonly string[] {
  return (message.payload?.['downloadSteps'] as readonly string[] | undefined) ?? []
}

/** 背景系テスト用の executor を組み立てる */
export function createTestExecutor(tabId: number = TEST_TAB_ID): DownloadStepExecutor {
  return new DownloadStepExecutor({
    hasRakutenTab: () => true,
    getActiveTabId: () => tabId,
  })
}

/** ページ遷移完了イベントを発火させ、遷移待ちを解消する */
export function firePageTransition(tabId: number): void {
  const addListener = chrome.tabs.onUpdated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (
      id: number,
      changeInfo: { status?: string },
      tab: { url?: string }
    ) => void
    listener(tabId, { status: 'complete' }, { url: 'https://www.rakuten-sec.co.jp/web/dividend/' })
  }
}

/** ダウンロード開始イベントを発火させ、開始待ちを解消する */
export function fireDownloadCreatedByUrl(url = 'https://www.rakuten-sec.co.jp/download.csv'): void {
  const addListener = chrome.downloads.onCreated.addListener as unknown as {
    mock: { calls: unknown[][] }
  }
  for (const call of addListener.mock.calls) {
    const listener = call[0] as (item: Pick<chrome.downloads.DownloadItem, 'url'>) => void
    listener({ url })
  }
}

/** 応答なしでチャネルが閉じた状況を再現する */
export function failWithChannelClosed(callback?: (response: DownloadResponse) => void): void {
  const runtime = chrome.runtime as unknown as { lastError?: { message: string } }
  runtime.lastError = {
    message:
      'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
  }
  callback?.({ success: false, error: 'レスポンスがありません' })
  delete runtime.lastError
}

/** content script 不在の状況を再現する */
export function failWithContentScriptMissing(callback?: (response: DownloadResponse) => void): void {
  const runtime = chrome.runtime as unknown as { lastError?: { message: string } }
  runtime.lastError = {
    message: 'Could not establish connection. Receiving end does not exist',
  }
  callback?.({ success: false, error: 'レスポンスがありません' })
  delete runtime.lastError
}

/** タブ再読み込みの完了イベントを発火させる */
export function fireTabReload(tabId: number): void {
  firePageTransition(tabId)
}
