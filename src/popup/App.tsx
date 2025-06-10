import { useState } from 'react'
import type { DownloadResponse, Message, IconLabelProps } from '../types/common';
import 'bootstrap/dist/css/bootstrap.min.css';


function App() {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [message, setMessage] = useState<Message | null>(null);

  const handleDownload = async (): Promise<void> => {
    setIsDownloading(true);
    setMessage(null);

    try {
      // アクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // 楽天証券のサイトかどうかチェック
      if (!tab.url?.includes('rakuten-sec.co.jp')) {
        setMessage({ state: 'error', content: '楽天証券のサイトで使用してください' });
        return;
      }

      // コンテンツスクリプトにメッセージを送信
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'downloadCSV',
        message: '楽天証券の取引データをCSV形式でダウンロードします'
      }) as DownloadResponse;

      if (response?.success) {
        setMessage({ state: 'success', content: 'CSVダウンロードを開始しました' });
      } else {
        setMessage({ state: 'error', content: 'CSVダウンロードに失敗しました' });
      }
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      setMessage({ state: 'error', content: 'エラーが発生しました。ページを再読み込みして再試行してください。' });
    } finally {
      setIsDownloading(false);
    }
  };

  const openRakutenPage = (): void => {
    chrome.tabs.create({
      url: 'https://www.rakuten-sec.co.jp/'
    });
  };

  const Header = () => (
    <header className='h3 bg-danger bg-gradient text-white text-center p-2'>
      <span className="icon">📈</span>
      楽天証券 CSV取得ツール
    </header>
  );

  const Footer = () => (
    <footer>
      <div className="badge bg-secondary text-center w-100">
        楽天証券CSV拡張機能 v1.0.0
      </div>
    </footer>
  );

  const renderIconLabel = ({ icon, label, containerClassName = 'icon-label', iconClassName = 'icon', }: IconLabelProps) => (
    <div className={containerClassName}>
      <span className={iconClassName}>{icon}</span>
      {label}
    </div >
  );


  const Message = (message?: Message) => {
    if (!message) return null;
    const isSuccess = message.state === 'success';
    return (
      <div
        className={`alert alert-custom ${isSuccess ? 'alert-success-custom' : 'alert-danger-custom'} `}
        role="alert"
      >
        {isSuccess ? (
          renderIconLabel({ icon: '✅', label: '成功' })
        ) : (
          renderIconLabel({ icon: '⚠️', label: 'エラー' })
        )}
        {message.content}
      </div>
    );
  };

  return (
    <div className="popup-container" style={{ width: '300px' }}>
      <Header />

      <main className="p-2">
        <div className='mb-3 h6' onClick={openRakutenPage} style={{ cursor: 'pointer' }}>
          {renderIconLabel({ icon: '🔗', label: '楽天証券を開く' })}
        </div>

        <div className='mb-3 h6'>
          {renderIconLabel({ icon: '📊', label: '取得オプション' })}
        </div>

        <div className='align-items-center d-flex justify-content-center'>
          <button className="badge bg-primary btn p-2 text-white w-100" onClick={handleDownload} disabled={isDownloading} >
            {isDownloading ? (
              renderIconLabel({ icon: '⟳', label: 'ダウンロード中...', iconClassName: 'loading-spinner' })
            ) : (
              renderIconLabel({ icon: '💾', label: 'CSVダウンロード' })
            )}
          </button>
        </div>

        {message && <Message {...message} />}
      </main >

      <Footer />
    </div >
  );
}

export default App;
