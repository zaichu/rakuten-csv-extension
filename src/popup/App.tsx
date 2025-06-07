import { useState } from 'react'
import './custom.css'

interface DownloadResponse {
  success: boolean;
  message?: string;
}

function App() {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const handleDownload = async (): Promise<void> => {
    setIsDownloading(true);
    setMessage('');
    setMessageType('');

    try {
      // アクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // 楽天証券のサイトかどうかチェック
      if (!tab.url?.includes('rakuten-sec.co.jp')) {
        setMessage('楽天証券のサイトで使用してください');
        setMessageType('error');
        return;
      }

      // コンテンツスクリプトにメッセージを送信
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'downloadCSV'
      }) as DownloadResponse;

      if (response?.success) {
        setMessage('CSVダウンロードを開始しました');
        setMessageType('success');
      } else {
        setMessage('CSVダウンロードに失敗しました');
        setMessageType('error');
      }
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      setMessage('エラーが発生しました。ページを再読み込みして再試行してください。');
      setMessageType('error');
    } finally {
      setIsDownloading(false);
    }
  };

  const openRakutenPage = (): void => {
    chrome.tabs.create({
      url: 'https://www.rakuten-sec.co.jp/'
    });
  };

  return (
    <div className="popup-container">
      {/* ヘッダー */}
      <header className="popup-header">
        <h1 className="popup-title">
          <span className="icon">📈</span>
          楽天証券CSVダウンロード
        </h1>
        <p className="popup-subtitle">取引データを簡単エクスポート</p>
      </header>

      {/* メインコンテンツ */}
      <main className="p-3">
        {/* 楽天証券サイトを開くカード */}
        <div className="action-card">
          <h6 className="card-title mb-2 text-rakuten">
            <span className="icon">🔗</span>
            楽天証券サイト
          </h6>
          <p className="card-text small text-muted mb-2">
            楽天証券の取引画面にアクセスしてください
          </p>
          <button
            onClick={openRakutenPage}
            className="btn btn-outline-rakuten btn-sm w-100"
            type="button"
          >
            楽天証券サイトを開く
          </button>
        </div>

        {/* CSVダウンロードカード */}
        <div className="action-card">
          <h6 className="card-title mb-2 text-rakuten">
            <span className="icon">📊</span>
            データダウンロード
          </h6>
          <p className="card-text small text-muted mb-3">
            現在のページの取引データをCSV形式でダウンロードします
          </p>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn btn-rakuten w-100 py-2"
            type="button"
          >
            {isDownloading ? (
              <>
                <span className="loading-spinner">⟳</span>
                ダウンロード中...
              </>
            ) : (
              <>
                <span className="icon">💾</span>
                CSVダウンロード
              </>
            )}
          </button>
        </div>

        {/* メッセージ表示 */}
        {message && (
          <div 
            className={`alert alert-custom ${
              messageType === 'success' 
                ? 'alert-success-custom' 
                : 'alert-danger-custom'
            }`}
            role="alert"
          >
            <span className="icon">
              {messageType === 'success' ? '✅' : '⚠️'}
            </span>
            {message}
          </div>
        )}

        {/* 使用方法カード */}
        <div className="action-card mt-3">
          <h6 className="card-title mb-2 text-rakuten">
            <span className="icon">💡</span>
            使用方法
          </h6>
          <ul className="small text-muted mb-0 ps-3">
            <li>楽天証券にログインしてください</li>
            <li>取引履歴やポートフォリオ画面を開いてください</li>
            <li>「CSVダウンロード」ボタンをクリックしてください</li>
          </ul>
        </div>
      </main>

      {/* フッター */}
      <footer className="popup-footer">
        <div className="d-flex justify-content-between align-items-center">
          <span>楽天証券CSV拡張機能</span>
          <span className="badge bg-secondary">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
