import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../popup/App'
import { mockChrome } from './setup'

describe('App (ポップアップ)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('コンポーネントが正常にレンダリングされる', () => {
    render(<App />)

    expect(screen.getByText('楽天証券CSVダウンロード')).toBeInTheDocument()
    expect(screen.getByText('取引データを簡単エクスポート')).toBeInTheDocument()
    expect(screen.getByText('楽天証券サイトを開く')).toBeInTheDocument()
    expect(screen.getByText('CSVダウンロード')).toBeInTheDocument()
  })

  it('楽天証券サイトを開くボタンが機能する', async () => {
    const user = userEvent.setup()
    render(<App />)

    const openSiteButton = screen.getByText('楽天証券サイトを開く')
    await user.click(openSiteButton)

    expect(mockChrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.rakuten-sec.co.jp/'
    })
  })

  it('CSVダウンロードボタンが楽天証券サイト以外では警告を表示する', async () => {
    const user = userEvent.setup()

    // 楽天証券サイト以外のタブをモック
    mockChrome.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://example.com' }
    ])

    render(<App />)

    const downloadButton = screen.getByRole('button', { name: /CSVダウンロード/ })
    await user.click(downloadButton)

    await waitFor(() => {
      expect(screen.getByText('楽天証券のサイトで使用してください')).toBeInTheDocument()
    })
  })

  it('CSVダウンロードボタンが楽天証券サイトで正常に動作する', async () => {
    const user = userEvent.setup()

    // 楽天証券サイトのタブをモック
    mockChrome.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://www.rakuten-sec.co.jp/some-page' }
    ])

    // sendMessageが成功を返すようにモック
    mockChrome.tabs.sendMessage.mockResolvedValue({ success: true })

    render(<App />)

    const downloadButton = screen.getByRole('button', { name: /CSVダウンロード/ })
    await user.click(downloadButton)

    await waitFor(() => {
      expect(screen.getByText('CSVダウンロードを開始しました')).toBeInTheDocument()
    })

    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
      action: 'downloadCSV'
    })
  })

  it('ダウンロード中はボタンが無効化される', async () => {
    const user = userEvent.setup()

    mockChrome.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://www.rakuten-sec.co.jp/some-page' }
    ])

    // sendMessageを遅延させる
    mockChrome.tabs.sendMessage.mockImplementation(
      () => new Promise(resolve =>
        setTimeout(() => resolve({ success: true }), 100)
      )
    )

    render(<App />)

    const downloadButton = screen.getByRole('button', { name: /CSVダウンロード/ })
    await user.click(downloadButton)

    // ダウンロード中はボタンが無効化される
    expect(downloadButton).toBeDisabled()
    expect(screen.getByText('ダウンロード中...')).toBeInTheDocument()

    // 完了後はボタンが有効化される
    await waitFor(() => {
      expect(downloadButton).not.toBeDisabled()
    })
  })

  it('エラーが発生した場合エラーメッセージが表示される', async () => {
    const user = userEvent.setup()

    // タブが見つからない場合をテスト
    mockChrome.tabs.query.mockResolvedValue([])

    render(<App />)

    const downloadButton = screen.getByRole('button', { name: /CSVダウンロード/ })
    await user.click(downloadButton)

    await waitFor(() => {
      expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument()
    })
  })

  it('使用方法のリストが表示される', () => {
    render(<App />)

    expect(screen.getByText('使用方法')).toBeInTheDocument()
    expect(screen.getByText('楽天証券にログインしてください')).toBeInTheDocument()
    expect(screen.getByText('取引履歴やポートフォリオ画面を開いてください')).toBeInTheDocument()
    expect(screen.getByText('「CSVダウンロード」ボタンをクリックしてください')).toBeInTheDocument()
  })

  it('フッターにバージョン情報が表示される', () => {
    render(<App />)

    expect(screen.getByText('楽天証券CSV拡張機能')).toBeInTheDocument()
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
  })

  it('Bootstrapクラスが適用されている', () => {
    render(<App />)

    const container = document.querySelector('.popup-container')
    expect(container).toBeInTheDocument()

    const cards = document.querySelectorAll('.action-card')
    expect(cards.length).toBeGreaterThan(0)

    const buttons = document.querySelectorAll('.btn')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
