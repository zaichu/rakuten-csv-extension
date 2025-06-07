import { StrictMode } from 'react'
import { type Root, createRoot } from 'react-dom/client'

// 1. consoleにテキストを出力
console.log('Hello Content')

// 2. reactのルートとなる要素を作成
const rootEl: HTMLElement = document.createElement('div')
document.body.insertBefore(rootEl, document.body.firstElementChild)

// 3. reactルートを挿入しページにテキストを表示
const root: Root = createRoot(rootEl)
root.render(
    <StrictMode>
        <h1 style={{ position: 'fixed', zIndex: 999 }}>Hello Content!</h1>
    </StrictMode>
)