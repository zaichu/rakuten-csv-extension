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

  describe('getElementByXPath', () => {
    it('有効なXPathで要素を返す', () => {
      const div = document.createElement('div')
      div.id = 'xpath-target'
      document.body.appendChild(div)

      const result = DomUtils.getElementByXPath('//*[@id="xpath-target"]')
      expect(result).toBe(div)
    })

    it('不正なXPathでnullを返す', () => {
      const result = DomUtils.getElementByXPath('///!!invalid')
      expect(result).toBeNull()
      expect(console.warn).toHaveBeenCalled()
    })

    it('存在しない要素のXPathでnullを返す', () => {
      const result = DomUtils.getElementByXPath('//*[@id="nonexistent-9999"]')
      expect(result).toBeNull()
    })
  })

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

  describe('isElementVisible', () => {
    it('isElementInteractableと同じ結果を返す', () => {
      const div = document.createElement('div')
      document.body.appendChild(div)
      makeInteractable(div)
      expect(DomUtils.isElementVisible(div)).toBe(DomUtils.isElementInteractable(div))
    })

    it('非表示要素はfalse', () => {
      const div = document.createElement('div')
      div.style.display = 'none'
      document.body.appendChild(div)
      expect(DomUtils.isElementVisible(div)).toBe(false)
    })
  })

  describe('findElement', () => {
    it('操作可能な要素を返す', () => {
      const btn = document.createElement('button')
      btn.id = 'find-btn'
      document.body.appendChild(btn)
      makeInteractable(btn)

      expect(DomUtils.findElement(['#find-btn'])).toBe(btn)
    })

    it('操作不可能な要素をスキップして次のselectorを試す', () => {
      const hidden = document.createElement('button')
      hidden.id = 'hidden-btn'
      hidden.style.display = 'none'
      document.body.appendChild(hidden)

      const visible = document.createElement('button')
      visible.id = 'visible-btn'
      document.body.appendChild(visible)
      makeInteractable(visible)

      expect(DomUtils.findElement(['#hidden-btn', '#visible-btn'])).toBe(visible)
    })

    it('不正なselectorは警告を出してスキップする', () => {
      DomUtils.findElement(['!!!invalid-selector'])
      expect(console.warn).toHaveBeenCalled()
    })

    it('何も見つからない場合はnull', () => {
      expect(DomUtils.findElement(['#does-not-exist'])).toBeNull()
    })
  })

  describe('findElementWithConfig', () => {
    it('requireVisible=true: 操作可能な要素のみ返す', () => {
      const div = document.createElement('div')
      div.id = 'config-visible'
      document.body.appendChild(div)
      makeInteractable(div)

      const result = DomUtils.findElementWithConfig({ selectors: ['#config-visible'], requireVisible: true })
      expect(result).toBe(div)
    })

    it('requireVisible=true: 非表示要素はnull', () => {
      const div = document.createElement('div')
      div.id = 'config-hidden'
      div.style.display = 'none'
      document.body.appendChild(div)

      const result = DomUtils.findElementWithConfig({ selectors: ['#config-hidden'], requireVisible: true })
      expect(result).toBeNull()
    })

    it('requireVisible=false: 非表示要素も返す', () => {
      const div = document.createElement('div')
      div.id = 'config-hidden2'
      div.style.display = 'none'
      document.body.appendChild(div)

      const result = DomUtils.findElementWithConfig({ selectors: ['#config-hidden2'], requireVisible: false })
      expect(result).toBe(div)
    })

    it('XPath selector(//) で要素を返す', () => {
      const span = document.createElement('span')
      span.id = 'xpath-config-span'
      document.body.appendChild(span)
      makeInteractable(span)

      const originalQS = document.querySelector.bind(document)
      vi.spyOn(document, 'querySelector').mockImplementation((sel) => {
        if (typeof sel === 'string' && sel.startsWith('//')) return null
        return originalQS(sel)
      })

      const result = DomUtils.findElementWithConfig({ selectors: ['//*[@id="xpath-config-span"]'] })
      expect(result).toBe(span)
    })

    it('contains(text()) selector でテキストから要素を返す', () => {
      const p = document.createElement('p')
      p.textContent = 'こんにちは世界'
      document.body.appendChild(p)
      makeInteractable(p)

      const originalQS = document.querySelector.bind(document)
      vi.spyOn(document, 'querySelector').mockImplementation((sel) => {
        if (typeof sel === 'string' && sel.includes('contains(')) return null
        return originalQS(sel)
      })

      const result = DomUtils.findElementWithConfig({
        selectors: ["p[contains(text(), 'こんにちは世界')]"],
        requireVisible: true,
      })
      expect(result).toBe(p)
    })

    it('見つからない場合はnull', () => {
      const result = DomUtils.findElementWithConfig({ selectors: ['#no-such-element'] })
      expect(result).toBeNull()
    })
  })

  describe('findElementWithMultipleSelectors', () => {
    it('カンマ区切りのselector文字列で要素を検索する', () => {
      const div = document.createElement('div')
      div.id = 'multi-div'
      document.body.appendChild(div)
      makeInteractable(div)

      const result = DomUtils.findElementWithMultipleSelectors('#nonexistent, #multi-div')
      expect(result).toBe(div)
    })

    it('全て見つからない場合はnull', () => {
      expect(DomUtils.findElementWithMultipleSelectors('#a, #b, #c')).toBeNull()
    })
  })

  describe('findElementByText', () => {
    it('タグ指定ありでテキスト内容に一致する要素を返す', () => {
      const button = document.createElement('button')
      button.textContent = '送信する'
      document.body.appendChild(button)

      const result = DomUtils.findElementByText("button[contains(text(), '送信する')]")
      expect(result).toBe(button)
    })

    it('タグ指定なしの場合はnullを返す', () => {
      const span = document.createElement('span')
      span.textContent = 'ユニークなテキスト123'
      document.body.appendChild(span)

      const result = DomUtils.findElementByText("contains(text(), 'ユニークなテキスト123')")
      expect(result).toBeNull()
    })

    it('contains(text()) パターンでない場合はnull', () => {
      expect(DomUtils.findElementByText('#button')).toBeNull()
    })

    it('テキストが存在しない場合はnull', () => {
      const result = DomUtils.findElementByText("button[contains(text(), '存在しないテキスト9999')]")
      expect(result).toBeNull()
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

    it('操作不可能なHTMLElementでも警告を出してclick()を呼ぶ', () => {
      const button = document.createElement('button')
      button.disabled = true
      document.body.appendChild(button)

      const clickSpy = vi.spyOn(button, 'click').mockImplementation(() => {})
      const result = DomUtils.safeClick(button)
      expect(result).toBe(true)
      expect(clickSpy).toHaveBeenCalledOnce()
      expect(console.warn).toHaveBeenCalled()
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
