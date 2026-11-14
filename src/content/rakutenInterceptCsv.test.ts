import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { arm, disarm, isArmed } from './rakutenInterceptCsv'

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('rakutenInterceptCsv (MAIN world)', () => {
  beforeEach(() => {
    disarm()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    disarm()
    vi.restoreAllMocks()
  })

  it('合図なしでは横取りしない', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://example.com/csv'
    document.body.appendChild(form)

    form.submit()

    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(isArmed()).toBe(false)
  })

  it('submit で同一 method の fetch を行い元 submit を抑止する', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(4), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-submit')
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://example.com/csv'
    const input = document.createElement('input')
    input.name = 'q'
    input.value = 'secret-value'
    form.appendChild(input)
    document.body.appendChild(form)

    const messages: unknown[] = []
    const listener = (event: MessageEvent): void => { messages.push(event.data) }
    window.addEventListener('message', listener)

    form.submit()

    await flush()
    await flush()

    window.removeEventListener('message', listener)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, options] = fetchSpy.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect(isArmed()).toBe(false)
    expect(messages.some((m) => (m as { ok?: boolean }).ok === true)).toBe(true)
  })

  it('fetch 失敗でも元 API を復元する', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-fail')
    const form = document.createElement('form')
    form.method = 'GET'
    form.action = 'https://example.com/csv'
    document.body.appendChild(form)

    form.submit()
    await flush()
    await flush()

    expect(isArmed()).toBe(false)
    // restored submit should be original function
    expect(typeof HTMLFormElement.prototype.submit).toBe('function')
  })

  it('HTML レスポンスは失敗として返す', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-html')
    const messages: unknown[] = []
    const listener = (event: MessageEvent): void => { messages.push(event.data) }
    window.addEventListener('message', listener)

    const form = document.createElement('form')
    form.method = 'GET'
    form.action = 'https://example.com/csv'
    document.body.appendChild(form)
    form.submit()

    await flush()
    await flush()

    window.removeEventListener('message', listener)

    const result = messages.find((m) => (m as { type?: string }).type === 'rakuten-csv-intercept:result') as
      | { ok?: boolean; error?: string; contentType?: string }
      | undefined
    expect(result?.ok).toBe(false)
    expect(result?.error).toContain('text/html')
    expect(result?.error).not.toContain('secret')
  })

  it('requestSubmit / anchor / location / window.open を捕捉する', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    // requestSubmit
    arm('n1')
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://example.com/csv'
    document.body.appendChild(form)
    form.requestSubmit()
    await flush()
    await flush()
    expect(fetchSpy).toHaveBeenCalled()

    // anchor
    disarm()
    arm('n2')
    fetchSpy.mockClear()
    const a = document.createElement('a')
    a.href = 'https://example.com/csv'
    document.body.appendChild(a)
    a.click()
    await flush()
    await flush()
    expect(fetchSpy).toHaveBeenCalled()

    // window.open
    disarm()
    arm('n4')
    fetchSpy.mockClear()
    window.open('https://example.com/csv')
    await flush()
    await flush()
    expect(fetchSpy).toHaveBeenCalled()
  })
})