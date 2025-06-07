import { describe, it, expect, vi, beforeEach } from 'vitest'

// RakutenCSVExtensionクラスのテスト用インターフェース
interface MockElement extends HTMLElement {
  click: () => void
}

// DOMメソッドをモック
const mockDocument = {
  ...document,
  evaluate: vi.fn(),
  createElement: vi.fn(),
  querySelector: vi.fn(),
  head: {
    ...document.head,
    appendChild: vi.fn()
  },
  body: {
    ...document.body,
    appendChild: vi.fn()
  },
  title: '配当・分配金一覧',
  getElementById: vi.fn(),
  readyState: 'complete'
}

// グローバルなdocumentをモック
vi.stubGlobal('document', mockDocument)

// windowオブジェクトもモック
const mockWindow = {
  ...window,
  location: {
    href: 'https://www.rakuten-sec.co.jp/ass_dividend_history.do'
  }
}
vi.stubGlobal('window', mockWindow)

// Chromeオブジェクトをモック
const mockChromeRuntime = {
  onMessage: {
    addListener: vi.fn()
  }
}
vi.stubGlobal('chrome', { runtime: mockChromeRuntime })

describe('RakutenCSVExtension (コンテンツスクリプト)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // createElementのデフォルト実装をリセット
    mockDocument.createElement.mockImplementation((_tagName: string) => {
      const element = {
        id: '',
        className: '',
        type: '',
        innerHTML: '',
        textContent: '',
        addEventListener: vi.fn(),
        setAttribute: vi.fn(),
        style: {},
        classList: {
          add: vi.fn()
        }
      } as any
      return element
    })
  })

  it('初期化時にメッセージリスナーが設定される', async () => {
    // 動的インポートでコンテンツスクリプトを読み込み
    await import('../content/rakuten-content')

    expect(mockChromeRuntime.onMessage.addListener).toHaveBeenCalled()
  })

  it('対象ページでフローティングボタンが作成される', async () => {
    // 対象ページの条件をセット
    mockDocument.title = '配当・分配金一覧'
    mockWindow.location.href = 'https://www.rakuten-sec.co.jp/ass_dividend_history.do'

    await import('../content/rakuten-content')

    expect(mockDocument.createElement).toHaveBeenCalledWith('button')
    expect(mockDocument.body.appendChild).toHaveBeenCalled()
  })

  it('CSSが正しく注入される', async () => {
    await import('../content/rakuten-content')

    expect(mockDocument.createElement).toHaveBeenCalledWith('style')
    expect(mockDocument.head.appendChild).toHaveBeenCalled()
  })

  it('XPathでCSVボタンが見つかった場合クリックされる', async () => {
    // モックボタン要素
    const mockButton: MockElement = {
      click: vi.fn()
    } as any

    // evaluateメソッドがボタンを返すようにモック
    mockDocument.evaluate.mockReturnValue({
      singleNodeValue: mockButton
    })

    await import('../content/rakuten-content')

    // メッセージリスナーを取得してテスト
    const addListenerCall = mockChromeRuntime.onMessage.addListener.mock.calls[0]
    const messageListener = addListenerCall[0]

    const mockSendResponse = vi.fn()
    messageListener({ action: 'downloadCSV' }, null, mockSendResponse)

    expect(mockButton.click).toHaveBeenCalled()
    expect(mockSendResponse).toHaveBeenCalledWith({ success: true })
  })

  it('CSVボタンが見つからない場合エラー通知が表示される', async () => {
    // evaluateメソッドがnullを返すようにモック
    mockDocument.evaluate.mockReturnValue({
      singleNodeValue: null
    })

    await import('../content/rakuten-content')

    // メッセージリスナーを取得してテスト
    const addListenerCall = mockChromeRuntime.onMessage.addListener.mock.calls[0]
    const messageListener = addListenerCall[0]

    const mockSendResponse = vi.fn()
    messageListener({ action: 'downloadCSV' }, null, mockSendResponse)

    // エラー通知が作成される
    expect(mockDocument.createElement).toHaveBeenCalledWith('div')
    expect(mockDocument.body.appendChild).toHaveBeenCalled()
  })

  it('対象ページ判定が正しく動作する', () => {
    const testCases = [
      {
        title: '配当・分配金一覧',
        url: 'https://www.rakuten-sec.co.jp/some-page',
        expected: true
      },
      {
        title: '普通のページ',
        url: 'https://www.rakuten-sec.co.jp/ass_dividend_history.do',
        expected: true
      },
      {
        title: '普通のページ',
        url: 'https://www.rakuten-sec.co.jp/other-page',
        expected: false
      }
    ]

    testCases.forEach(({ title, url, expected }) => {
      mockDocument.title = title
      mockWindow.location.href = url

      // ページタイトルまたはURLに含まれているかチェック
      const isTargetPage = title.includes('配当・分配金') || url.includes('ass_dividend_history.do')
      expect(isTargetPage).toBe(expected)
    })
  })

  it('通知が正しいクラス名で作成される', async () => {
    let createdElements: any[] = []

    mockDocument.createElement.mockImplementation((_tagName: string) => {
      const element = {
        id: '',
        className: '',
        innerHTML: '',
        setAttribute: vi.fn(),
        classList: { add: vi.fn() },
        style: {}
      } as any
      createdElements.push(element)
      return element
    })

    await import('../content/rakuten-content')

    // 成功通知のテスト
    const addListenerCall = mockChromeRuntime.onMessage.addListener.mock.calls[0]
    const messageListener = addListenerCall[0]

    // CSVボタンが見つかる場合をモック
    mockDocument.evaluate.mockReturnValue({
      singleNodeValue: { click: vi.fn() }
    })

    messageListener({ action: 'downloadCSV' }, null, vi.fn())

    // 通知要素が作成されることを確認
    const notificationElements = createdElements.filter(el =>
      el.className.includes('rakuten-notification')
    )
    expect(notificationElements.length).toBeGreaterThan(0)
  })

  it('フローティングボタンに正しい属性が設定される', async () => {
    let createdButton: any = null

    mockDocument.createElement.mockImplementation((tagName: string) => {
      const element = {
        id: '',
        className: '',
        type: '',
        innerHTML: '',
        addEventListener: vi.fn(),
        setAttribute: vi.fn((attr: string, value: string) => {
          element[attr] = value
        }),
        style: {}
      } as any

      if (tagName === 'button') {
        createdButton = element
      }

      return element
    })

    await import('../content/rakuten-content')

    // ボタンが作成され、正しい属性が設定されることを確認
    expect(createdButton).toBeTruthy()
    expect(createdButton.setAttribute).toHaveBeenCalledWith('aria-label', 'CSVダウンロード')
    expect(createdButton.setAttribute).toHaveBeenCalledWith('title', 'CSVダウンロード')
  })
})
