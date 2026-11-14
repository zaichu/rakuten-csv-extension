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
    await new Promise((resolve) => setTimeout(resolve, 50))
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

  it('fetch rejection の本文を結果に含めない', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('https://example.com/csv?secret=leak failed'))
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-secret')
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
      | { ok?: boolean; error?: string }
      | undefined
    expect(result?.ok).toBe(false)
    expect(result?.error).not.toContain('secret')
    expect(result?.error).not.toContain('http')
    expect(result?.error).toContain('form-submit')
  })

  it('GET form は値を query に含め body なしで fetch する', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-get')
    const form = document.createElement('form')
    form.method = 'GET'
    form.action = 'https://example.com/csv'
    const input = document.createElement('input')
    input.name = 'q'
    input.value = 'v'
    form.appendChild(input)
    document.body.appendChild(form)

    form.submit()
    await flush()
    await flush()

    const [url, options] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('q=v')
    expect(options.body).toBeUndefined()
  })

  it('POST urlencoded は URLSearchParams を body にする', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-post-ue')
    const form = document.createElement('form')
    form.method = 'POST'
    form.enctype = 'application/x-www-form-urlencoded'
    form.action = 'https://example.com/csv'
    const input = document.createElement('input')
    input.name = 'q'
    input.value = 'v'
    form.appendChild(input)
    document.body.appendChild(form)

    form.submit()
    await flush()
    await flush()

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(URLSearchParams)
  })

  it('POST multipart は FormData を body にする', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-post-mp')
    const form = document.createElement('form')
    form.method = 'POST'
    form.enctype = 'multipart/form-data'
    form.action = 'https://example.com/csv'
    const input = document.createElement('input')
    input.name = 'q'
    input.value = 'v'
    form.appendChild(input)
    document.body.appendChild(form)

    form.submit()
    await flush()
    await flush()

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
  })

  it('POST text/plain は仕様どおりに body を直列化する', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-post-tp')
    const form = document.createElement('form')
    form.method = 'POST'
    form.enctype = 'text/plain'
    form.action = 'https://example.com/csv'
    const input = document.createElement('input')
    input.name = 'q'
    input.value = 'v'
    form.appendChild(input)
    document.body.appendChild(form)

    form.submit()
    await flush()
    await flush()

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.body).toBe('q=v')
  })

  it('BOM/空白の後に HTML が始まる本文は拒否する', async () => {
    const html = new TextEncoder().encode('\ufeff   <html>login</html>')
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(html, { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-bom')
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
      | { ok?: boolean; error?: string }
      | undefined
    expect(result?.ok).toBe(false)
  })

  it('requestSubmit でも fetch は1回だけ', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-reqsubmit-once')
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://example.com/csv'
    document.body.appendChild(form)

    form.requestSubmit()
    await flush()
    await flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('requestSubmit submitter の form* 属性と name/value を反映する', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-submitter')
    const form = document.createElement('form')
    form.method = 'GET'
    form.action = 'https://example.com/csv'
    const button = document.createElement('button')
    button.type = 'submit'
    button.name = 'btn'
    button.value = 'go'
    button.setAttribute('formaction', 'https://example.com/other')
    button.setAttribute('formmethod', 'POST')
    button.setAttribute('formenctype', 'text/plain')
    form.appendChild(button)
    document.body.appendChild(form)

    form.requestSubmit(button)
    await flush()
    await flush()

    const [url, options] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://example.com/other')
    expect(options.method).toBe('POST')
    expect(options.body).toBe('btn=go')
  })

  it('anchor の onclick が requestSubmit しても fetch は1回でフォーム要求を使う', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ArrayBuffer(2), { status: 200, headers: { 'content-type': 'text/csv' } })
    )
    vi.stubGlobal('fetch', fetchSpy)

    arm('nonce-anchor-onclick')
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://example.com/form'
    const input = document.createElement('input')
    input.name = 'q'
    input.value = 'v'
    form.appendChild(input)
    document.body.appendChild(form)

    const anchor = document.createElement('a')
    anchor.href = 'https://example.com/anchor'
    anchor.onclick = () => {
      form.requestSubmit()
    }
    document.body.appendChild(anchor)

    anchor.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, options] = fetchSpy.mock.calls[0]
    expect(String(url)).toBe('https://example.com/form')
    expect(options.method).toBe('POST')
  })

  it('disarm 後に armed が false になる', () => {
    arm('nonce-disarm')
    expect(isArmed()).toBe(true)
    disarm()
    expect(isArmed()).toBe(false)
  })
})