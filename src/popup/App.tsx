import { useState } from 'react'

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
    <div style={{ width: '320px', padding: '20px', fontFamily: '"Hiragino Kaku Gothic ProN", Meiryo, sans-serif', backgroundColor: '#f8f9fa' }}>
      <header style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #bf0000', paddingBottom: '15px' }}>
        <h1 style={{ margin: '0', fontSize: '18px', color: '#bf0000', fontWeight: 'bold' }}>
          楽天証券CSVダウンロード
        </h1>
      </header>

      <main style={{ marginBottom: '20px' }}>
        <button
          onClick={openRakutenPage}
          style={{ width: '100%', padding: '8px 16px', backgroundColor: 'white', color: '#bf0000', border: '1px solid #bf0000', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.3s ease' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f5f5f5';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
          🔗 楽天証券サイトを開く
        </button>

        <button
          onClick={handleDownload}
          disabled={isDownloading}
          style={{ width: '100%', padding: '12px 16px', backgroundColor: isDownloading ? '#ccc' : '#bf0000', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: isDownloading ? 'not-allowed' : 'pointer', transition: 'background-color 0.3s ease', marginBottom: '10px' }}
          onMouseEnter={(e) => {
            if (!isDownloading) {
              e.currentTarget.style.backgroundColor = '#960000';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDownloading) {
              e.currentTarget.style.backgroundColor = '#bf0000';
            }
          }}
        >
          {isDownloading ? (
            <span>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', marginRight: '8px' }}>⟳</span>
              ダウンロード中...
            </span>
          ) : (
            '📊 CSVダウンロード'
          )}
        </button>



        {message && (
          <div style={{ marginTop: '15px', padding: '10px', borderRadius: '6px', fontSize: '12px', backgroundColor: messageType === 'success' ? '#d4edda' : '#f8d7da', color: messageType === 'success' ? '#155724' : '#721c24', border: `1px solid ${messageType === 'success' ? '#c3e6cb' : '#f5c6cb'}` }}>
            {message}
          </div>
        )}
      </main>

      <footer style={{ textAlign: 'center', fontSize: '10px', color: '#999', borderTop: '1px solid #e0e0e0', paddingTop: '10px' }}>
        <p style={{ margin: '0' }}>
          楽天証券CSVダウンロード拡張機能 v1.0.0
        </p>
      </footer>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

export default App;
