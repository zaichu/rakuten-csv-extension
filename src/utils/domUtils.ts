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
   * エレメントが表示されているかチェック
   */
  static isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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
   * エレメントを安全にクリック
   */
  static safeClick(element: Element | null): boolean {
    if (!element) return false;
    
    try {
      if (element instanceof HTMLElement) {
        element.click();
        return true;
      }
    } catch (error) {
      console.error('Click failed:', error);
    }
    return false;
  }
}
