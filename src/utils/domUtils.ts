/**
 * DOM操作関連のユーティリティクラス
 * 楽天証券サイトでの安全なDOM操作を提供
 */
export class DomUtils {
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
   * 要素を安全にクリック（改良版）
   */
  static safeClick(element: Element | null): boolean {
    if (!element || !(element instanceof HTMLElement)) {
      console.warn('クリック対象が無効な要素です');
      return false;
    }

    try {
      // 楽天証券サイトでは非表示要素でもクリック可能な場合があるため、
      // interactable 判定でブロックせず、そのまま click() を試す。
      // 成功する非致命ケースを Chrome 拡張のエラー一覧に残さないため warn は出さない。

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
}
