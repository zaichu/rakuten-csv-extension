import { StrictMode } from 'react'
import { type Root, createRoot } from 'react-dom/client'

// 1. consoleにテキストを出力
console.log('Hello Content')

// 2. reactのルートとなる要素を作成
const rootEl: HTMLElement = document.createElement('div')
rootEl.style.cssText = `
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 9999;
  background: linear-gradient(135deg, #28a745, #20c997);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
`
document.body.insertBefore(rootEl, document.body.firstElementChild)

// 3. reactルートを挿入しページにテキストを表示
const root: Root = createRoot(rootEl)
root.render(
    <StrictMode>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1em' }}>🚀</span>
            <span>楽天証券CSV拡張機能が読み込まれました</span>
        </div>
    </StrictMode>
)

// 3秒後にメッセージを自動削除
setTimeout(() => {
    rootEl.style.animation = 'fadeOut 0.3s ease-out forwards'
    setTimeout(() => {
        if (rootEl.parentNode) {
            rootEl.remove()
        }
    }, 300)
}, 3000)

// フェードアウトアニメーション用のCSSを追加
const style = document.createElement('style')
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-10px); }
  }
`
document.head.appendChild(style)
