import { describe, it, expect, beforeEach } from 'vitest'
import { CSV_DOWNLOAD_CONFIGS } from './csvDownloadConfigs'
import type { CsvDownloadType } from '../types'

/**
 * マイメニューのリンク HTML は Issue #131 でユーザーが実画面確認したものを再現。
 * 保有系リンクを取り違えないことをセレクター単位で固定する。
 */
describe('csvDownloadConfigs セレクター', () => {
  const jpStockMenuLinkHtml = `<a class="pcm-gl-mega-list__link" href="#" onclick="memberPageJump('/app/ass_jp_stk_possess_lst.do;BV_SessionID=xxx?eventType=directInit');close_mymenu();return false;" data-ratid="mem_pc_mymenu_jp-possess-lst">国内株式</a>`
  const fundMenuLinkHtml = `<a class="pcm-gl-mega-list__link" href="#" onclick="memberPageJump('/app/ass_fu_possess_lst.do;BV_SessionID=xxx?eventType=directInit');close_mymenu();return false;" data-ratid="mem_pc_mymenu_fu-possess-lst" data-ratevent="click" data-ratparam="all">投資信託</a>`

  /** content script の findElement と同じ順序で、グループ内の先頭マッチ要素を返す */
  function findBySelectorGroup(selectorGroup: string): Element | null {
    for (const selector of selectorGroup.split(',').map((s) => s.trim())) {
      const element = document.querySelector(selector)
      if (element) return element
    }
    return null
  }

  function eachSelector(selectorGroup: string): string[] {
    return selectorGroup.split(',').map((s) => s.trim())
  }

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('assetbalance の menuLink は投資信託リンクにマッチしない', () => {
    document.body.innerHTML = fundMenuLinkHtml
    const fundLink = document.querySelector('a') as Element
    for (const selector of eachSelector(CSV_DOWNLOAD_CONFIGS['assetbalance'].selectors.menuLink!)) {
      expect(fundLink.matches(selector)).toBe(false)
    }
  })

  it('assetbalance の menuLink は投資信託リンクが先にあっても国内株式リンクを拾う', () => {
    document.body.innerHTML = fundMenuLinkHtml + jpStockMenuLinkHtml
    const element = findBySelectorGroup(CSV_DOWNLOAD_CONFIGS['assetbalance'].selectors.menuLink!)
    expect(element?.getAttribute('data-ratid')).toBe('mem_pc_mymenu_jp-possess-lst')
  })

  it('fundbalance の menuLink は投資信託リンクにマッチし国内株式リンクにはマッチしない', () => {
    document.body.innerHTML = jpStockMenuLinkHtml + fundMenuLinkHtml
    const element = findBySelectorGroup(CSV_DOWNLOAD_CONFIGS['fundbalance'].selectors.menuLink!)
    expect(element?.getAttribute('data-ratid')).toBe('mem_pc_mymenu_fu-possess-lst')

    const jpLink = document.querySelector("a[data-ratid='mem_pc_mymenu_jp-possess-lst']") as Element
    for (const selector of eachSelector(CSV_DOWNLOAD_CONFIGS['fundbalance'].selectors.menuLink!)) {
      expect(jpLink.matches(selector)).toBe(false)
    }
  })

  it('fundbalance の csvButton は実画面の「CSVで保存」input にマッチする', () => {
    document.body.innerHTML = `<input type="image" class="roll" src="/member/images/btn-save-csv-02.png" border="0" alt="CSVで保存" align="absmiddle" onclick="csvDownLoad();return false;">`
    const element = findBySelectorGroup(CSV_DOWNLOAD_CONFIGS['fundbalance'].selectors.csvButton!)
    expect(element?.getAttribute('alt')).toBe('CSVで保存')
  })

  it('fundbalance のステップはページ遷移とCSV保存のみ', () => {
    expect(CSV_DOWNLOAD_CONFIGS['fundbalance'].steps).toEqual([
      'navigate-to-page',
      'download-csv',
    ])
  })

  it('CsvDownloadType の全種類に設定がある', () => {
    const types: CsvDownloadType[] = [
      'assetbalance',
      'fundbalance',
      'dividend',
      'domesticstock',
      'mutualfund',
    ]
    for (const type of types) {
      expect(CSV_DOWNLOAD_CONFIGS[type].downloadType).toBe(type)
    }
  })
})
