import type { ElementSearchConfig } from '../types';

/**
 * DOM操作関連のユーティリティクラス
 * 楽天証券サイトでの安全なDOM操作を提供
 */
export class DomUtils {
  private static readonly DEFAULT_TIMEOUT = 5000;
  private static readonly DEFAULT_RETRY_INTERVAL = 100;

  /**
   * XPathで要素を取得
   */
  static getElementByXPath(xpath: string): Element | null {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue as Element | null;
    } catch (error) {
      console.warn(`XPath実行エラー: ${xpath}`, error);
      return null;
    }
  }

  /**
   * 複数のセレクターで要素を検索
   */
  static findElement(selectors: readonly string[]): Element | null {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && this.isElementInteractable(element)) {
          return element;
        }
      } catch (error) {
        console.warn(`セレクター実行エラー: ${selector}`, error);
        continue;
      }
    }
    return null;
  }

  /**
   * 要素が操作可能かどうかをチェック
   */
  static isElementInteractable(element: Element): boolean {
    if (!element) return false;

    // HTMLElementでない場合は操作不可
    if (!(element instanceof HTMLElement)) return false;

    // disabled属性のチェック
    if ('disabled' in element && (element as HTMLInputElement | HTMLButtonElement).disabled) {
      return false;
    }

    // style属性での非表示チェック
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0') {
      return false;
    }

    // 要素の位置とサイズのチェック
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * 要素が表示されているかチェック（後方互換性のため）
   */
  static isElementVisible(element: Element): boolean {
    return this.isElementInteractable(element);
  }

  /**
   * 複数のセレクターで要素を検索（設定可能な検索）
   */
  static findElementWithConfig(config: ElementSearchConfig): Element | null {
    const { selectors, requireVisible = true } = config;

    for (const selector of selectors) {
      try {
        // 通常のCSSセレクター
        const element = document.querySelector(selector);
        if (element) {
          const isValid = requireVisible ? this.isElementInteractable(element) : true;
          if (isValid) {
            console.log(`要素が見つかりました: ${selector}`);
            return element;
          }
        }

        // XPath対応（//で始まる場合）
        if (selector.startsWith('//')) {
          const xpathElement = this.getElementByXPath(selector);
          if (xpathElement) {
            const isValid = requireVisible ? this.isElementInteractable(xpathElement) : true;
            if (isValid) {
              console.log(`XPathで要素が見つかりました: ${selector}`);
              return xpathElement;
            }
          }
        }

        // テキスト内容で検索（contains関数対応）
        if (selector.includes('contains(')) {
          const textElement = this.findElementByText(selector);
          if (textElement) {
            const isValid = requireVisible ? this.isElementInteractable(textElement) : true;
            if (isValid) {
              console.log(`テキスト検索で要素が見つかりました: ${selector}`);
              return textElement;
            }
          }
        }
      } catch (error) {
        console.warn(`セレクター実行エラー: ${selector}`, error);
        continue;
      }
    }

    return null;
  }

  /**
   * 複数のセレクターで要素を検索（後方互換性のため）
   */
  static findElementWithMultipleSelectors(selectorGroup: string): Element | null {
    const selectors = selectorGroup.split(',').map(s => s.trim());
    return this.findElementWithConfig({ selectors });
  }

  /**
   * テキスト内容で要素を検索
   */
  static findElementByText(selector: string): Element | null {
    try {
      // contains(text(), 'テキスト') パターンを解析
      const containsMatch = selector.match(/contains\(text\(\),\s*['"]([^'"]+)['"]?\)/);
      if (!containsMatch) return null;

      const searchText = containsMatch[1];
      const tagMatch = selector.match(/^([a-zA-Z]+)/);
      const tagName = tagMatch ? tagMatch[1].toLowerCase() : '*';

      // 指定されたタグまたは全ての要素からテキストを検索
      const elements = tagName === '*'
        ? document.querySelectorAll('*')
        : document.querySelectorAll(tagName);

      for (const element of elements) {
        if (element.textContent?.includes(searchText)) {
          return element;
        }
      }
    } catch (error) {
      console.warn(`テキスト検索エラー: ${selector}`, error);
    }

    return null;
  }

  /**
   * 要素の読み込み完了を待機（Promise版）
   */
  static waitForElement(
    selector: string,
    timeout: number = this.DEFAULT_TIMEOUT
  ): Promise<Element> {
    return new Promise((resolve, reject) => {
      // 既存要素をチェック
      const existingElement = document.querySelector(selector);
      if (existingElement && this.isElementInteractable(existingElement)) {
        resolve(existingElement);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element && this.isElementInteractable(element)) {
          observer.disconnect();
          clearTimeout(timeoutId);
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });

      const timeoutId = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素が見つかりませんでした: ${selector} (${timeout}ms)`));
      }, timeout);
    });
  }

  /**
   * 設定可能な要素待機
   */
  static async waitForElementWithConfig(config: ElementSearchConfig): Promise<Element> {
    const {
      selectors,
      timeout = this.DEFAULT_TIMEOUT,
      retryInterval = this.DEFAULT_RETRY_INTERVAL,
      requireVisible = true
    } = config;

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = this.findElementWithConfig({ selectors, requireVisible });
      if (element) {
        return element;
      }

      await this.sleep(retryInterval);
    }

    throw new Error(`要素が見つかりませんでした: ${selectors.join(', ')} (${timeout}ms)`);
  }

  /**
   * 要素のテキスト内容を安全に取得
   */
  static getTextContent(element: Element | null): string {
    return element?.textContent?.trim() || '';
  }

  /**
   * 要素を安全にクリック（改良版）
   */
  static safeClick(element: Element | null): boolean {
    if (!element || !(element instanceof HTMLElement)) {
      console.warn('クリック対象が無効な要素です');
      return false;
    }

    try {
      // 要素が操作可能かチェック（コメントアウトされた条件を削除）
      if (!this.isElementInteractable(element)) {
        console.warn('要素が操作不可能な状態です');
        // return false; // 楽天証券サイトでは非表示要素でもクリック可能な場合があるため、警告のみ
      }

      // フォーカスを当ててからクリック
      element.focus();

      // 通常のクリックを試行
      element.click();
      console.log('通常のクリックが成功しました');
      return true;

    } catch (clickError) {
      console.warn('通常のクリックが失敗、代替手段を試行:', clickError);

      try {
        // MouseEventを生成してクリック
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });

        const dispatched = element.dispatchEvent(clickEvent);
        if (dispatched) {
          console.log('イベント発火でのクリックが成功しました');
          return true;
        }
      } catch (eventError) {
        console.warn('イベント発火も失敗:', eventError);
      }

      // input要素の特別処理
      if (element instanceof HTMLInputElement) {
        return this.handleInputElementClick(element);
      }

      // button要素の特別処理
      if (element instanceof HTMLButtonElement) {
        return this.handleButtonElementClick(element);
      }
    }

    console.error('すべてのクリック方法が失敗しました');
    return false;
  }

  /**
   * Input要素の特別なクリック処理
   */
  private static handleInputElementClick(element: HTMLInputElement): boolean {
    try {
      switch (element.type) {
        case 'submit':
        case 'button':
          if (element.form) {
            element.form.submit();
            console.log('フォーム送信でのクリックが成功しました');
            return true;
          }
          break;

        case 'radio':
        case 'checkbox':
          element.checked = !element.checked;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('ラジオ/チェックボックスの状態変更が成功しました');
          return true;

        case 'image':
          // 画像ボタンの場合、onclickイベントを直接実行
          if (element.onclick) {
            element.onclick.call(element, new MouseEvent('click') as PointerEvent);
            console.log('onclick関数の直接実行が成功しました');
            return true;
          }
          break;
      }
    } catch (error) {
      console.warn('Input要素の特別処理が失敗:', error);
    }

    return false;
  }

  /**
   * Button要素の特別なクリック処理
   */
  private static handleButtonElementClick(element: HTMLButtonElement): boolean {
    try {
      if (element.form && element.type === 'submit') {
        element.form.submit();
        console.log('ボタンからのフォーム送信が成功しました');
        return true;
      }

      // onclick属性の直接実行
      if (element.onclick) {
        element.onclick.call(element, new MouseEvent('click') as PointerEvent);
        console.log('ボタンのonclick関数実行が成功しました');
        return true;
      }
    } catch (error) {
      console.warn('Button要素の特別処理が失敗:', error);
    }

    return false;
  }

  /**
   * 指定ミリ秒待機
   */
  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 要素の属性を安全に取得
   */
  static getAttribute(element: Element | null, attributeName: string): string | null {
    try {
      return element?.getAttribute(attributeName) || null;
    } catch (error) {
      console.warn(`属性取得エラー (${attributeName}):`, error);
      return null;
    }
  }

  /**
   * 要素のスタイルプロパティを安全に取得
   */
  static getComputedStyleProperty(element: Element | null, property: string): string | null {
    try {
      if (!element || !(element instanceof HTMLElement)) return null;
      const style = window.getComputedStyle(element);
      return style.getPropertyValue(property) || null;
    } catch (error) {
      console.warn(`スタイル取得エラー (${property}):`, error);
      return null;
    }
  }
}
