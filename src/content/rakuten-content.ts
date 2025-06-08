// 楽天証券のコンテンツスクリプト
class RakutenCSVExtension {
  // private csvButtonXPath = '/html/body/div[1]/div/div[5]/div/div[2]/div[2]/div/div/div/ul/li[5]/a';

  constructor() {
    this.init();
  }

  private init(): void {
    console.log('楽天証券CSVダウンロード拡張機能が初期化されました');
    this.setupMessageListener();

  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      if (message.action === 'downloadCSV') {
        alert(message.message);
        sendResponse({ success: true });
      }
      return true;
    });
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
