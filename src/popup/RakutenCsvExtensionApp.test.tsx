import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import RakutenCsvExtensionApp from './RakutenCsvExtensionApp'

// RakutenCsvExtensionApp は描画時に __APP_VERSION__ グローバルを参照する。
// vitest.config.ts には define が無いためテスト側でスタブする。
vi.stubGlobal('__APP_VERSION__', 'test-version')

/**
 * Issue #70 分割前の振る舞いを固定する characterization test。
 * リファクタ前後で1文字も変更せずに通り続けることが成功条件。
 */
describe('RakutenCsvExtensionApp characterization', () => {
  it('初期表示でカテゴリ見出し・アイコン・各オプションのチェックボックスが表示される', () => {
    const { container } = render(<RakutenCsvExtensionApp />)

    // カテゴリ見出しとアイコン
    expect(screen.getByText('ポートフォリオ')).toBeInTheDocument()
    expect(screen.getByText('取引履歴')).toBeInTheDocument()
    expect(screen.getByText('収益情報')).toBeInTheDocument()
    // 📈 は Header アイコンとポートフォリオのカテゴリアイコンで複数存在する
    expect(screen.getAllByText('📈').length).toBeGreaterThanOrEqual(2)
    // 📊 はカテゴリアイコン(取引履歴)と assetbalance のオプションアイコンで複数存在する
    expect(screen.getAllByText('📊').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('💰').length).toBeGreaterThanOrEqual(2)

    // 各オプションのチェックボックス (4件)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(4)
    // 国内株式ラベルは assetbalance / domesticstock で重複する点も仕様通り
    expect(screen.getAllByText('国内株式')).toHaveLength(2)
    expect(screen.getByText('配当金・分配金')).toBeInTheDocument()
    expect(screen.getByText('投資信託')).toBeInTheDocument()

    // 初期状態は未選択 (「選択中」テキストは子要素で分割されるため textContent で確認)
    checkboxes.forEach((checkbox) => {
      expect(checkbox).not.toBeChecked()
    })
    expect(container.querySelector('.selection-info')?.textContent).toContain('選択中')
  })

  it('チェックボックスをクリックすると選択状態が変わる', () => {
    const { container } = render(<RakutenCsvExtensionApp />)

    const summary = container.querySelector('.selection-summary')
    expect(summary?.textContent).toContain('選択中')
    expect(summary?.textContent).toContain('0')
    expect(summary?.textContent).toContain('4')

    const dividend = screen.getByRole('checkbox', { name: /配当金・分配金/ })
    fireEvent.click(dividend)

    expect(dividend).toBeChecked()
    expect(container.querySelector('.selection-summary')?.textContent).toContain('1')

    // 選択された行に option-row-selected クラスが付く
    const selectedRows = container.querySelectorAll('.option-row-selected')
    expect(selectedRows).toHaveLength(1)
    expect(selectedRows[0].textContent).toContain('配当金・分配金')

    // もう一度クリックすると解除される
    fireEvent.click(dividend)
    expect(dividend).not.toBeChecked()
    expect(container.querySelector('.selection-summary')?.textContent).toContain('0')
    expect(container.querySelectorAll('.option-row-selected')).toHaveLength(0)
  })

  it('カテゴリの「全選択」ボタンでカテゴリ内が一括選択/解除される', () => {
    const { container } = render(<RakutenCsvExtensionApp />)

    // 取引履歴カテゴリ (国内株式 domesticstock / 投資信託 の2件)
    const transactionSection = container.querySelector('[data-category="transaction"]')
    expect(transactionSection).not.toBeNull()
    const categoryButton = within(transactionSection as HTMLElement).getByRole('button', {
      name: '全選択',
    })

    fireEvent.click(categoryButton)

    // カテゴリ内2件が選択され、他カテゴリは未選択のまま
    expect(container.querySelectorAll('.option-row-selected')).toHaveLength(2)
    expect(
      (transactionSection as HTMLElement).querySelector('.category-count')?.textContent,
    ).toBe('2/2')
    // ボタン表示が「全解除」に変わる
    expect(
      within(transactionSection as HTMLElement).getByRole('button', { name: '全解除' }),
    ).toBeInTheDocument()

    fireEvent.click(
      within(transactionSection as HTMLElement).getByRole('button', { name: '全解除' }),
    )
    expect(container.querySelectorAll('.option-row-selected')).toHaveLength(0)
    expect(
      (transactionSection as HTMLElement).querySelector('.category-count')?.textContent,
    ).toBe('0/2')
  })

  it('全体の「全選択」ボタンで全オプションが一括選択/解除される', () => {
    const { container } = render(<RakutenCsvExtensionApp />)

    const summary = container.querySelector('.selection-summary')
    const selectAllButton = within(summary as HTMLElement).getByRole('button', {
      name: '全選択',
    })

    fireEvent.click(selectAllButton)

    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(4)
    expect(container.querySelectorAll('.option-row-selected')).toHaveLength(4)
    expect(container.querySelector('.selection-summary')?.textContent).toContain('4')
    expect(
      within(summary as HTMLElement).getByRole('button', { name: '全解除' }),
    ).toBeInTheDocument()

    fireEvent.click(within(summary as HTMLElement).getByRole('button', { name: '全解除' }))
    expect(screen.getAllByRole('checkbox', { checked: false })).toHaveLength(4)
    expect(container.querySelectorAll('.option-row-selected')).toHaveLength(0)
    expect(container.querySelector('.selection-summary')?.textContent).toContain('0')
  })

  it('ダウンロードボタンは未選択時は無効・選択時は有効になる', () => {
    render(<RakutenCsvExtensionApp />)

    const downloadButton = screen.getByRole('button', { name: /CSV ダウンロード/ })
    expect(downloadButton).toBeDisabled()
    expect(downloadButton).toHaveTextContent('CSV ダウンロード')

    fireEvent.click(screen.getByRole('checkbox', { name: /配当金・分配金/ }))

    const enabledButton = screen.getByRole('button', { name: /CSV ダウンロード \(1件\)/ })
    expect(enabledButton).not.toBeDisabled()
  })
})
