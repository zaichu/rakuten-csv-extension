import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Chrome拡張機能のAPIモック
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
} as any

// beforeAll(() => {
//   Object.defineProperty(global, 'chrome', {
//     value: mockChrome,
//     writable: true,
//   })
// })

// CSSのインポートをモック
vi.mock('bootstrap/dist/css/bootstrap.min.css', () => ({}))
vi.mock('../popup/custom.css', () => ({}))

export { mockChrome }
