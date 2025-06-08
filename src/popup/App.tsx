import { useState } from 'react'
import type { DownloadResponse } from '../types/common';
import 'bootstrap/dist/css/bootstrap.min.css';


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
        action: 'downloadCSV',
        message: '楽天証券の取引データをCSV形式でダウンロードします'
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
    <div className="popup-container" style={{ width: '300px' }}>
      {/* ヘッダー */}
      <header className='h3 bg-danger bg-gradient text-white text-center p-2'>
        <span className="icon">📈</span>
        楽天証券 CSV取得ツール
      </header>

      {/* メインコンテンツ */}
      <main className="p-2">
        <div className='mb-3 h6' onClick={openRakutenPage} style={{ cursor: 'pointer' }}>
          <span className="icon">🔗</span>
          楽天証券を開く
        </div>

        <div className='mb-3 h6'>
          <span className="icon">📊</span>
          取得オプション
        </div>

        <div className='mb-3 align-items-center d-flex justify-content-center'>
          <button className="badge bg-primary btn p-2 text-white w-100" onClick={handleDownload} disabled={isDownloading} >
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
            className={`alert alert-custom ${messageType === 'success'
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
      </main>

      {/* フッター */}
      <footer className="popup-footer">
        <div className="badge bg-secondary text-center w-100">
          楽天証券CSV拡張機能 v1.0.0
        </div>
      </footer>
    </div>
  );
}

export default App;
