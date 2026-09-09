import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'

declare global {
  // UMD グローバル chrome の型拡張には namespace 構文が必須のため、当該ルールのみ除外する
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace chrome {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace tabs {
      /**
       * @types/chrome の tabs.query はコールバック形式のオーバーロードが
       * 最後に宣言されているため、vi.mocked(chrome.tabs.query) の戻り値型解決が
       * void になり mockResolvedValueOnce が型エラーになる。
       * Promise 形式を末尾に追記して型解決を Promise<Tab[]> にする。
       * シグネチャ自体は既存のものと同一であり、ランタイムへの影響はない。
       */
      function query(queryInfo: QueryInfo): Promise<Tab[]>
    }
  }
}

const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onActivated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  downloads: {
    onCreated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
} as unknown as typeof chrome

Object.defineProperty(globalThis, 'chrome', {
  value: mockChrome,
  writable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
})

vi.mock('../popup/custom.css', () => ({}))

export { mockChrome }
