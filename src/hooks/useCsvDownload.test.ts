import { renderHook, act } from '@testing-library/react'
import { vi, expect, describe, it } from 'vitest'
import { mockChrome } from '../tests/setup'
import { useCsvDownload } from './useCsvDownload'

const mockTabsQuery = mockChrome.tabs.query as ReturnType<typeof vi.fn>
const mockSendMessage = mockChrome.runtime.sendMessage as ReturnType<typeof vi.fn>

const rakutenTab = { id: 1, url: 'https://member.rakuten-sec.co.jp/app/' }

describe('useCsvDownload', () => {
  it('未選択時は Chrome API を呼ばずエラーになる', async () => {
    const { result } = renderHook(() => useCsvDownload())

    let response
    await act(async () => {
      response = await result.current.downloadCsv(new Set())
    })

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(response).toMatchObject({ success: false })
  })

  it('楽天証券タブで選択済みの場合、selectedOptions は配列として background に送信される', async () => {
    mockTabsQuery.mockResolvedValue([rakutenTab])
    mockSendMessage.mockResolvedValue({ success: true, message: '完了' })

    const { result } = renderHook(() => useCsvDownload())

    await act(async () => {
      await result.current.downloadCsv(new Set(['dividend', 'domesticstock'] as const))
    })

    expect(mockSendMessage).toHaveBeenCalledOnce()
    const call = mockSendMessage.mock.calls[0][0]
    expect(Array.isArray(call.payload.selectedOptions)).toBe(true)
    expect(call.payload.selectedOptions).toEqual(expect.arrayContaining(['dividend', 'domesticstock']))
  })

  it('background response が不正形状の場合、失敗レスポンスになる', async () => {
    mockTabsQuery.mockResolvedValue([rakutenTab])
    mockSendMessage.mockResolvedValue({ foo: 'bar' })

    const { result } = renderHook(() => useCsvDownload())

    let response
    await act(async () => {
      response = await result.current.downloadCsv(new Set(['dividend'] as const))
    })

    expect(response).toMatchObject({ success: false })
  })

  it('アクティブタブのログはクエリを含まない', async () => {
    const fullUrl = 'https://member.rakuten-sec.co.jp/app/?BV_SessionID=abc123&eventType=init'
    mockTabsQuery.mockResolvedValue([{ id: 1, url: fullUrl }])
    mockSendMessage.mockResolvedValue({ success: true, message: '完了' })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const { result } = renderHook(() => useCsvDownload())
      await act(async () => {
        await result.current.downloadCsv(new Set(['dividend'] as const))
      })

      const logged = logSpy.mock.calls.flat()
      expect(logged.some((arg) => typeof arg === 'string' && arg.includes(fullUrl))).toBe(false)
      expect(logged.some((arg) => typeof arg === 'string' && arg.includes('BV_SessionID'))).toBe(false)
      const activeTabCall = logSpy.mock.calls.find((args) => args[0] === 'アクティブなタブ:')
      expect(activeTabCall?.[1]).toEqual({ id: 1, url: 'https://member.rakuten-sec.co.jp/app/' })
    } finally {
      logSpy.mockRestore()
    }
  })

  it('サイト検証のログはクエリを含まない', async () => {
    const fullUrl = 'https://example.com/page?token=secret'
    mockTabsQuery.mockResolvedValue([{ id: 1, url: fullUrl }])
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const { result } = renderHook(() => useCsvDownload())
      let response
      await act(async () => {
        response = await result.current.downloadCsv(new Set(['dividend'] as const))
      })

      expect(response).toMatchObject({ success: false })
      const logged = logSpy.mock.calls.flat()
      expect(logged.some((arg) => typeof arg === 'string' && arg.includes(fullUrl))).toBe(false)
      expect(logged.some((arg) => typeof arg === 'string' && arg.includes('token=secret'))).toBe(false)
    } finally {
      logSpy.mockRestore()
    }
  })
})
