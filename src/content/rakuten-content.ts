// 楽天証券のコンテンツスクリプト
class RakutenCSVExtension {
  private csvButtonXPath = '/html/body/div[1]/div/div[5]/div/div[2]/div[2]/div/div/div/ul/li[5]/a';

  constructor() {
    this.init();
  }

  private init(): void {
    console.log('楽天証券CSVダウンロード拡張機能が初期化されました');
    this.setupMessageListener();
    this.addDownloadButton();
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

    const floatingButton = document.createElement('div');
    floatingButton.id = 'rakuten-csv-float-btn';
    floatingButton.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: #bf0000;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-family: 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transition: all 0.3s ease;
        border: none;
        user-select: none;
      " onmouseover="this.style.background='#960000'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.2)'" onmouseout="this.style.background='#bf0000'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'">
        📊 CSVダウンロード
      </div>
    `;

    floatingButton.addEventListener('click', () => {
      this.clickCSVButton();
    });

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
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10001;
      background: ${type === 'success' ? '#4CAF50' : '#f44336'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s ease;
      max-width: 300px;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 3秒後に自動で削除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
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
