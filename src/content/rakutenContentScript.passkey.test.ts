import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChromeMessage, DownloadResponse } from '../types'
import { silenceConsole, resetTestDoubles } from '../tests/fixtures'

type Listener = (
  message: ChromeMessage,
  sender: unknown,
  sendResponse: (r: DownloadResponse) => void
) => boolean

async function setupFreshListener(): Promise<{
  listener: Listener
  utils: typeof import('../utils')
}> {
  vi.resetModules()
  const utils = await import('../utils')
  vi.spyOn(utils.RakutenUtils, 'isRakutenSecurities').mockReturnValue(true)
  const mod = await import('./rakutenContentScript')
  mod.onExecute()
  const addListener = vi.mocked(chrome.runtime.onMessage.addListener)
  expect(addListener).toHaveBeenCalled()
  const listener = addListener.mock.calls[addListener.mock.calls.length - 1][0] as unknown as Listener
  return { listener, utils }
}

function sendCheckLoginState(listener: Listener): Promise<DownloadResponse> {
  return new Promise((resolve) => {
    listener({ action: 'check-login-state' } as unknown as ChromeMessage, {}, resolve)
  })
}

function showLoginScreen(): void {
  document.body.innerHTML = '<input type="password" /><button id="login-passkey">パスキーでログイン</button>'
}

describe('パスキーボタンの押下タイミング', () => {
  beforeEach(() => {
    silenceConsole()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    resetTestDoubles()
  })

  it('1回目の検出では押さない', async () => {
    const { listener, utils } = await setupFreshListener()
    showLoginScreen()
    const safeClick = vi.spyOn(utils.DomUtils, 'safeClick')

    const res = await sendCheckLoginState(listener)

    expect(res).toEqual({ success: true, loggedIn: false })
    expect(safeClick).not.toHaveBeenCalled()
  })

  it('2回目の検出で1回だけ押す', async () => {
    const { listener, utils } = await setupFreshListener()
    showLoginScreen()
    const safeClick = vi.spyOn(utils.DomUtils, 'safeClick')

    await sendCheckLoginState(listener)
    const res = await sendCheckLoginState(listener)

    expect(res).toEqual({ success: true, loggedIn: false })
    expect(safeClick).toHaveBeenCalledTimes(1)
  })

  it('3回目以降は押さない', async () => {
    const { listener, utils } = await setupFreshListener()
    showLoginScreen()
    const safeClick = vi.spyOn(utils.DomUtils, 'safeClick')

    await sendCheckLoginState(listener)
    await sendCheckLoginState(listener)
    await sendCheckLoginState(listener)
    await sendCheckLoginState(listener)

    expect(safeClick).toHaveBeenCalledTimes(1)
  })

  it('ボタンがなければ押さない', async () => {
    const { listener, utils } = await setupFreshListener()
    document.body.innerHTML = '<input type="password" />'
    const safeClick = vi.spyOn(utils.DomUtils, 'safeClick')

    await sendCheckLoginState(listener)
    await sendCheckLoginState(listener)

    expect(safeClick).not.toHaveBeenCalled()
  })

  it('ボタンがなければセレクター名だけをログに出す', async () => {
    const { listener } = await setupFreshListener()
    document.body.innerHTML = '<input type="password" />'

    await sendCheckLoginState(listener)
    await sendCheckLoginState(listener)

    const calls = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls]
    const selectorLogs = calls.filter((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('button#login-passkey'))
    )
    expect(selectorLogs.length).toBeGreaterThan(0)
    for (const args of selectorLogs) {
      for (const arg of args) {
        expect(arg instanceof Element).toBe(false)
        if (typeof arg === 'string') {
          expect(arg).not.toContain('http')
        }
      }
    }
  })
})
