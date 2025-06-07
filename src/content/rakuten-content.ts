// 楽天証券のコンテンツスクリプト
class RakutenCSVExtension {
  private csvButtonXPath = '/html/body/div[1]/div/div[5]/div/div[2]/div[2]/div/div/div/ul/li[5]/a';

  constructor() {
    this.init();
  }

  private init(): void {
    console.log('楽天証券CSVダウンロード拡張機能が初期化されました');
    this.injectCSS();
    this.setupMessageListener();
    this.addDownloadButton();
  }

  private injectCSS(): void {
    // CSSをページに注入
    const cssContent = `
      /* Bootstrap変数 */
      :root {
        --rakuten-red: #bf0000;
        --rakuten-red-hover: #960000;
      }

      /* フローティングボタンのBootstrapスタイル */
      .rakuten-floating-btn {
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        z-index: 10000 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 0.5rem !important;
        padding: 0.75rem 1.25rem !important;
        font-size: 0.875rem !important;
        font-weight: 600 !important;
        line-height: 1.5 !important;
        text-align: center !important;
        text-decoration: none !important;
        vertical-align: middle !important;
        cursor: pointer !important;
        user-select: none !important;
        background-color: var(--rakuten-red) !important;
        border: 1px solid var(--rakuten-red) !important;
        border-radius: 0.5rem !important;
        color: #fff !important;
        transition: all 0.15s ease-in-out !important;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      }

      .rakuten-floating-btn:hover {
        background-color: var(--rakuten-red-hover) !important;
        border-color: var(--rakuten-red-hover) !important;
        color: #fff !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 0.75rem 1.5rem rgba(0, 0, 0, 0.2) !important;
      }

      .rakuten-floating-btn:active {
        transform: translateY(0) !important;
        box-shadow: 0 0.25rem 0.5rem rgba(0, 0, 0, 0.15) !important;
      }

      /* 通知のBootstrapスタイル */
      .rakuten-notification {
        position: fixed !important;
        top: 80px !important;
        right: 20px !important;
        z-index: 10001 !important;
        max-width: 350px !important;
        padding: 1rem 1.25rem !important;
        margin-bottom: 1rem !important;
        border: 1px solid transparent !important;
        border-radius: 0.5rem !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        font-size: 0.875rem !important;
        line-height: 1.5 !important;
        animation: slideInRight 0.3s ease-out !important;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
      }

      .rakuten-notification-success {
        color: #0f5132 !important;
        background-color: #d1e7dd !important;
        border-color: #badbcc !important;
      }

      .rakuten-notification-error {
        color: #842029 !important;
        background-color: #f8d7da !important;
        border-color: #f5c2c7 !important;
      }

      /* アニメーション */
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      .rakuten-fade-out {
        animation: fadeOut 0.3s ease-out forwards !important;
      }

      /* レスポンシブ対応 */
      @media (max-width: 576px) {
        .rakuten-floating-btn {
          top: 10px !important;
          right: 10px !important;
          padding: 0.5rem 1rem !important;
          font-size: 0.75rem !important;
        }
        
        .rakuten-notification {
          top: 60px !important;
          right: 10px !important;
          left: 10px !important;
          max-width: none !important;
        }
      }
    `;

    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'downloadCSV') {
        this.clickCSVButton();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  private findElementByXPath(xpath: string): Element | null {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue as Element;
  }

  private clickCSVButton(): void {
    try {
      const csvButton = this.findElementByXPath(this.csvButtonXPath);

      if (csvButton) {
        console.log('CSVダウンロードボタンが見つかりました');

        // ボタンにクリックイベントを発火
        if (csvButton instanceof HTMLElement) {
          csvButton.click();
          console.log('CSVダウンロードボタンをクリックしました');
          this.showNotification('CSVダウンロードを開始しました', 'success');
        }
      } else {
        console.error('CSVダウンロードボタンが見つかりませんでした');
        this.showNotification('CSVダウンロードボタンが見つかりませんでした', 'error');
      }
    } catch (error) {
      console.error('CSVダウンロード中にエラーが発生しました:', error);
      this.showNotification('CSVダウンロード中にエラーが発生しました', 'error');
    }
  }

  private addDownloadButton(): void {
    // ページに独自のCSVダウンロードボタンを追加
    const isTargetPage = this.checkIfTargetPage();

    if (isTargetPage) {
      this.createFloatingButton();
    }
  }

  private checkIfTargetPage(): boolean {
    // 配当・分配金ページかどうかを確認
    const pageTitle = document.title;
    const url = window.location.href;

    return (
      pageTitle.includes('配当・分配金') ||
      url.includes('ass_dividend_history.do') ||
      document.querySelector('h1')?.textContent?.includes('配当・分配金') !== undefined
    );
  }

  private createFloatingButton(): void {
    // 既存のボタンがある場合は削除
    const existingButton = document.getElementById('rakuten-csv-float-btn');
    if (existingButton) {
      existingButton.remove();
    }

    const floatingButton = document.createElement('button');
    floatingButton.id = 'rakuten-csv-float-btn';
    floatingButton.className = 'rakuten-floating-btn';
    floatingButton.type = 'button';
    floatingButton.innerHTML = `
      <span style="font-size: 1.1em;">📊</span>
      <span>CSVダウンロード</span>
    `;

    floatingButton.addEventListener('click', () => {
      this.clickCSVButton();
    });

    // アクセシビリティ属性を追加
    floatingButton.setAttribute('aria-label', 'CSVダウンロード');
    floatingButton.setAttribute('title', 'CSVダウンロード');

    document.body.appendChild(floatingButton);
    console.log('フローティングCSVダウンロードボタンを追加しました');
  }

  private showNotification(message: string, type: 'success' | 'error'): void {
    // 既存の通知があれば削除
    const existingNotification = document.getElementById('rakuten-csv-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'rakuten-csv-notification';
    notification.className = `rakuten-notification rakuten-notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');

    // アイコンとメッセージを追加
    const icon = type === 'success' ? '✅' : '⚠️';
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="font-size: 1.1em;">${icon}</span>
        <span>${message}</span>
      </div>
    `;

    document.body.appendChild(notification);

    // 3秒後に自動で削除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.add('rakuten-fade-out');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 3000);
  }
}

// ページが読み込まれたら拡張機能を初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new RakutenCSVExtension();
  });
} else {
  new RakutenCSVExtension();
}
