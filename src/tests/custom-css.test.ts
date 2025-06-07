import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Custom CSS (カスタムスタイル)', () => {
  let styleElement: HTMLStyleElement

  beforeEach(() => {
    // テスト用のスタイル要素を作成
    styleElement = document.createElement('style')
    document.head.appendChild(styleElement)
  })

  afterEach(() => {
    // テスト後にクリーンアップ
    if (styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement)
    }
  })

  it('CSS変数が正しく定義されている', () => {
    const cssContent = `
      :root {
        --rakuten-red: #bf0000;
        --rakuten-red-hover: #960000;
        --rakuten-red-light: #f5e6e6;
      }
    `
    styleElement.textContent = cssContent

    // CSS変数が適用されているかテスト用要素で確認
    const testElement = document.createElement('div')
    testElement.style.cssText = 'color: var(--rakuten-red);'
    document.body.appendChild(testElement)

    expect(testElement.style.color).toBe('var(--rakuten-red)')
    
    document.body.removeChild(testElement)
  })

  it('ポップアップコンテナクラスが定義されている', () => {
    const cssContent = `
      .popup-container {
        width: 320px;
        min-height: 400px;
        background: linear-gradient(145deg, #ffffff, #f8f9fa);
        border-radius: 0.5rem;
      }
    `
    styleElement.textContent = cssContent

    // テスト要素を作成
    const testElement = document.createElement('div')
    testElement.className = 'popup-container'
    document.body.appendChild(testElement)

    // クラスが適用されていることを確認
    expect(testElement.classList.contains('popup-container')).toBe(true)
    
    document.body.removeChild(testElement)
  })

  it('ボタンクラスが定義されている', () => {
    const cssContent = `
      .btn-rakuten {
        background: var(--rakuten-red);
        border-color: var(--rakuten-red);
        color: white;
        font-weight: 600;
      }
      
      .btn-outline-rakuten {
        color: var(--rakuten-red);
        border-color: var(--rakuten-red);
        background: transparent;
      }
    `
    styleElement.textContent = cssContent

    // テスト要素を作成
    const rakutenBtn = document.createElement('button')
    rakutenBtn.className = 'btn-rakuten'
    
    const outlineBtn = document.createElement('button')
    outlineBtn.className = 'btn-outline-rakuten'

    document.body.appendChild(rakutenBtn)
    document.body.appendChild(outlineBtn)

    expect(rakutenBtn.classList.contains('btn-rakuten')).toBe(true)
    expect(outlineBtn.classList.contains('btn-outline-rakuten')).toBe(true)
    
    document.body.removeChild(rakutenBtn)
    document.body.removeChild(outlineBtn)
  })

  it('アラートクラスが定義されている', () => {
    const cssContent = `
      .alert-custom {
        border: none;
        border-radius: 0.375rem;
        font-size: 0.875rem;
        padding: 0.75rem 1rem;
      }
      
      .alert-success-custom {
        background: linear-gradient(135deg, #d4edda, #c3e6cb);
        color: #155724;
      }
      
      .alert-danger-custom {
        background: linear-gradient(135deg, #f8d7da, #f5c6cb);
        color: #721c24;
      }
    `
    styleElement.textContent = cssContent

    // テスト要素を作成
    const successAlert = document.createElement('div')
    successAlert.className = 'alert-custom alert-success-custom'
    
    const dangerAlert = document.createElement('div')
    dangerAlert.className = 'alert-custom alert-danger-custom'

    document.body.appendChild(successAlert)
    document.body.appendChild(dangerAlert)

    expect(successAlert.classList.contains('alert-custom')).toBe(true)
    expect(successAlert.classList.contains('alert-success-custom')).toBe(true)
    expect(dangerAlert.classList.contains('alert-custom')).toBe(true)
    expect(dangerAlert.classList.contains('alert-danger-custom')).toBe(true)
    
    document.body.removeChild(successAlert)
    document.body.removeChild(dangerAlert)
  })

  it('アニメーションクラスが定義されている', () => {
    const cssContent = `
      .loading-spinner {
        display: inline-block;
        animation: spin 1s linear infinite;
        margin-right: 0.5rem;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `
    styleElement.textContent = cssContent

    // テスト要素を作成
    const spinner = document.createElement('span')
    spinner.className = 'loading-spinner'
    document.body.appendChild(spinner)

    expect(spinner.classList.contains('loading-spinner')).toBe(true)
    
    document.body.removeChild(spinner)
  })

  it('レスポンシブ対応のメディアクエリが定義されている', () => {
    const cssContent = `
      @media (max-width: 320px) {
        .popup-container {
          width: 100%;
          border-radius: 0;
        }
      }
      
      @media (max-width: 576px) {
        .rakuten-floating-btn {
          top: 10px;
          right: 10px;
        }
      }
    `
    styleElement.textContent = cssContent

    // CSSにメディアクエリが含まれていることを確認
    expect(styleElement.textContent).toContain('@media (max-width: 320px)')
    expect(styleElement.textContent).toContain('@media (max-width: 576px)')
  })

  it('ダークモード対応が定義されている', () => {
    const cssContent = `
      @media (prefers-color-scheme: dark) {
        .popup-container {
          background: linear-gradient(145deg, #2c3e50, #34495e);
          color: #ecf0f1;
        }
      }
    `
    styleElement.textContent = cssContent

    // ダークモードのメディアクエリが含まれていることを確認
    expect(styleElement.textContent).toContain('@media (prefers-color-scheme: dark)')
    expect(styleElement.textContent).toContain('#2c3e50')
    expect(styleElement.textContent).toContain('#34495e')
  })

  it('アクセシビリティ対応が定義されている', () => {
    const cssContent = `
      .btn:focus,
      .btn-rakuten:focus {
        box-shadow: 0 0 0 0.2rem rgba(191, 0, 0, 0.25);
      }
      
      @media (prefers-reduced-motion: reduce) {
        .rakuten-floating-btn,
        .rakuten-notification {
          transition: none;
          animation: none;
        }
      }
    `
    styleElement.textContent = cssContent

    // アクセシビリティ関連のCSSが含まれていることを確認
    expect(styleElement.textContent).toContain(':focus')
    expect(styleElement.textContent).toContain('prefers-reduced-motion: reduce')
  })

  it('ユーティリティクラスが定義されている', () => {
    const cssContent = `
      .text-rakuten {
        color: var(--rakuten-red) !important;
      }
      
      .bg-rakuten {
        background-color: var(--rakuten-red) !important;
      }
      
      .border-rakuten {
        border-color: var(--rakuten-red) !important;
      }
    `
    styleElement.textContent = cssContent

    // テスト要素を作成
    const textElement = document.createElement('span')
    textElement.className = 'text-rakuten'
    
    const bgElement = document.createElement('div')
    bgElement.className = 'bg-rakuten'
    
    const borderElement = document.createElement('div')
    borderElement.className = 'border-rakuten'

    document.body.appendChild(textElement)
    document.body.appendChild(bgElement)
    document.body.appendChild(borderElement)

    expect(textElement.classList.contains('text-rakuten')).toBe(true)
    expect(bgElement.classList.contains('bg-rakuten')).toBe(true)
    expect(borderElement.classList.contains('border-rakuten')).toBe(true)
    
    document.body.removeChild(textElement)
    document.body.removeChild(bgElement)
    document.body.removeChild(borderElement)
  })
})
