/**
 * DOM操作関連のユーティリティ関数
 */
export class DomUtils {
  /**
   * XPathでエレメントを取得
   */
  static getElementByXPath(xpath: string): Element | null {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as Element | null;
  }

  /**
   * 複数のセレクターでエレメントを検索
   */
  static findElement(selectors: string[]): Element | null {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  /**
   * エレメントが表示されているかチェック（改良版）
   */
  static isElementVisible(element: Element): boolean {
    if (!element) return false;

    // display: none や visibility: hidden をチェック
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    // 要素が画面内にあるかチェック
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * 複数のセレクターでエレメントを検索（柔軟な検索）
   */
  static findElementWithMultipleSelectors(selectorGroup: string): Element | null {
    const selectors = selectorGroup.split(',').map(s => s.trim());

    for (const selector of selectors) {
      try {
        // 通常のCSSセレクター
        const element = document.querySelector(selector);
        if (element && this.isElementVisible(element)) {
          console.log(`要素が見つかりました: ${selector}`);
          return element;
        }

        // テキスト内容で検索（contains関数対応）
        if (selector.includes('contains(')) {
          const textElement = this.findElementByText(selector);
          if (textElement && this.isElementVisible(textElement)) {
            console.log(`テキスト検索で要素が見つかりました: ${selector}`);
            return textElement;
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
   * テキスト内容で要素を検索
   */
  static findElementByText(selector: string): Element | null {
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
      if (element.textContent && element.textContent.includes(searchText)) {
        return element;
      }
    }

    return null;
  }

  /**
   * エレメントの読み込み完了を待機
   */
  static waitForElement(
    selector: string,
    timeout: number = 5000
  ): Promise<Element> {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * エレメントのテキスト内容を安全に取得
   */
  static getTextContent(element: Element | null): string {
    return element?.textContent?.trim() || '';
  }

  /**
   * エレメントを安全にクリック（改良版）
   */
  static safeClick(element: Element | null): boolean {
    if (!element) return false;

    try {
      // 要素が表示されているか確認
      // if (!this.isElementVisible(element)) {
      //   console.warn('要素が非表示のためクリックできません');
      //   return false;
      // }

      // HTMLElementとしてクリック
      if (element instanceof HTMLElement) {
        // フォーカスを当ててからクリック
        element.focus();

        // 複数のクリック方法を試行
        try {
          element.click();
          console.log('通常のクリックが成功しました');
          return true;
        } catch (clickError) {
          console.warn('通常のクリックが失敗、イベント発火を試行:', clickError);

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
        }
      }

      // inputやbuttonの場合は追加の方法を試行
      if (element instanceof HTMLInputElement) {
        if (element.type === 'submit' || element.type === 'button') {
          try {
            element.form?.submit();
            console.log('フォーム送信でのクリックが成功しました');
            return true;
          } catch (submitError) {
            console.warn('フォーム送信が失敗:', submitError);
          }
        }

        if (element.type === 'radio' || element.type === 'checkbox') {
          element.checked = !element.checked;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('ラジオ/チェックボックスの状態変更が成功しました');
          return true;
        }
      }

    } catch (error) {
      console.error('クリック処理でエラーが発生:', error);
    }

    return false;
  }
}
