import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'

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
