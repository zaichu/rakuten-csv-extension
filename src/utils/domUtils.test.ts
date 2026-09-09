import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DomUtils } from './domUtils'

describe('DomUtils', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeInteractable(element: HTMLElement) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 30,
      top: 0,
      left: 0,
      bottom: 30,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)
  }

  describe('isElementInteractable', () => {
    it('HTMLElementでない要素(SVGElement)はfalse', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      document.body.appendChild(svg)
      expect(DomUtils.isElementInteractable(svg)).toBe(false)
    })

    it('disabled属性の要素はfalse', () => {
      const button = document.createElement('button')
      button.disabled = true
      document.body.appendChild(button)
      expect(DomUtils.isElementInteractable(button)).toBe(false)
    })

    it('display:noneの要素はfalse', () => {
      const div = document.createElement('div')
      div.style.display = 'none'
      document.body.appendChild(div)
      expect(DomUtils.isElementInteractable(div)).toBe(false)
    })

    it('visibility:hiddenの要素はfalse', () => {
      const div = document.createElement('div')
      div.style.visibility = 'hidden'
      document.body.appendChild(div)
      makeInteractable(div)
      expect(DomUtils.isElementInteractable(div)).toBe(false)
    })

    it('opacity:0の要素はfalse', () => {
      const div = document.createElement('div')
      div.style.opacity = '0'
      document.body.appendChild(div)
      makeInteractable(div)
      expect(DomUtils.isElementInteractable(div)).toBe(false)
    })

    it('サイズ0x0の要素はfalse', () => {
      const div = document.createElement('div')
      document.body.appendChild(div)
      vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect)
      expect(DomUtils.isElementInteractable(div)).toBe(false)
    })

    it('サイズありの表示要素はtrue', () => {
      const div = document.createElement('div')
      document.body.appendChild(div)
      makeInteractable(div)
      expect(DomUtils.isElementInteractable(div)).toBe(true)
    })
  })

  describe('getTextContent', () => {
    it('要素のテキストをtrimして返す', () => {
      const div = document.createElement('div')
      div.textContent = '  テストテキスト  '
      expect(DomUtils.getTextContent(div)).toBe('テストテキスト')
    })

    it('nullを渡すと空文字列を返す', () => {
      expect(DomUtils.getTextContent(null)).toBe('')
    })

    it('textContentが空の要素は空文字列を返す', () => {
      const div = document.createElement('div')
      expect(DomUtils.getTextContent(div)).toBe('')
    })
  })

  describe('safeClick', () => {
    it('nullを渡すとfalseを返す', () => {
      expect(DomUtils.safeClick(null)).toBe(false)
      expect(console.warn).toHaveBeenCalled()
    })

    it('HTMLElementでない要素(SVG)はfalseを返す', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      document.body.appendChild(svg)
      expect(DomUtils.safeClick(svg)).toBe(false)
    })

    it('HTMLElementでclick()が呼ばれtrueを返す', () => {
      const button = document.createElement('button')
      document.body.appendChild(button)
      makeInteractable(button)

      const clickSpy = vi.spyOn(button, 'click').mockImplementation(() => {})
      const result = DomUtils.safeClick(button)
      expect(result).toBe(true)
      expect(clickSpy).toHaveBeenCalledOnce()
    })

    it('操作不可能なHTMLElementでも警告なしでclick()を継続する', () => {
      const button = document.createElement('button')
      button.disabled = true
      document.body.appendChild(button)

      const clickSpy = vi.spyOn(button, 'click').mockImplementation(() => {})
      const result = DomUtils.safeClick(button)
      expect(result).toBe(true)
      expect(clickSpy).toHaveBeenCalledOnce()
      expect(console.warn).not.toHaveBeenCalled()
    })
  })

  describe('getAttribute', () => {
    it('属性値を返す', () => {
      const div = document.createElement('div')
      div.setAttribute('data-id', '42')
      expect(DomUtils.getAttribute(div, 'data-id')).toBe('42')
    })

    it('属性が存在しない場合はnull', () => {
      const div = document.createElement('div')
      expect(DomUtils.getAttribute(div, 'data-nonexistent')).toBeNull()
    })

    it('nullを渡すとnull', () => {
      expect(DomUtils.getAttribute(null, 'data-id')).toBeNull()
    })
  })

  describe('getComputedStyleProperty', () => {
    it('スタイルプロパティを返す', () => {
      const div = document.createElement('div')
      div.style.color = 'red'
      document.body.appendChild(div)

      const result = DomUtils.getComputedStyleProperty(div, 'color')
      expect(result).not.toBeNull()
    })

    it('nullを渡すとnull', () => {
      expect(DomUtils.getComputedStyleProperty(null, 'color')).toBeNull()
    })

    it('HTMLElementでない要素はnull', () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      document.body.appendChild(svg)
      expect(DomUtils.getComputedStyleProperty(svg, 'color')).toBeNull()
    })
  })
})
