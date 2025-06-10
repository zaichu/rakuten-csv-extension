import React from 'react';
import { Header, Footer, IconLabel, Message } from '../components';
import { useApplicationMessage, useCsvDownload } from '../hooks';
import { RakutenUtils } from '../utils';
import 'bootstrap/dist/css/bootstrap.min.css';

/**
 * 楽天証券CSV拡張機能のメインアプリケーション
 */
const RakutenCsvExtensionApp: React.FC = () => {
  const { message, showSuccess, showError, clearMessage } = useApplicationMessage();
  const { isDownloading, downloadCsv } = useCsvDownload();

  /**
   * CSVダウンロード処理
   */
  const handleDownload = async (): Promise<void> => {
    clearMessage();

    try {
      const response = await downloadCsv('all');

      if (response.success) {
        showSuccess('CSVダウンロードを開始しました');
      } else {
        showError(response.error || 'CSVダウンロードに失敗しました');
      }
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      showError('予期しないエラーが発生しました');
    }
  };

  /**
   * 楽天証券ページを開く
   */
  const handleOpenRakutenPage = (): void => {
    RakutenUtils.openRakutenPage();
  };

  /**
   * ダウンロードボタンの内容を取得
   */
  const getDownloadButtonContent = () => {
    if (isDownloading) {
      return (
        <IconLabel
          icon="⟳"
          label="ダウンロード中..."
          iconClassName="loading-spinner"
        />
      );
    }
    return (
      <IconLabel
        icon="💾"
        label="CSVダウンロード"
      />
    );
  };

  return (
    <div className="popup-container" style={{ width: '320px', minHeight: '200px' }}>
      <Header 
        title="楽天証券 CSV取得ツール" 
        icon="📈"
      />

      <main className="p-3">
        {/* 楽天証券を開くリンク */}
        <div 
          className="mb-3 h6 text-primary" 
          onClick={handleOpenRakutenPage} 
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenRakutenPage()}
        >
          <IconLabel 
            icon="🔗" 
            label="楽天証券を開く" 
          />
        </div>

        {/* 取得オプション */}
        <div className="mb-3">
          <div className="h6 mb-2">
            <IconLabel 
              icon="📊" 
              label="取得オプション" 
            />
          </div>
          
          <div className="d-grid gap-2">
            {/* メインダウンロードボタン */}
            <button 
              className="btn btn-primary d-flex align-items-center justify-content-center"
              onClick={handleDownload} 
              disabled={isDownloading}
              type="button"
            >
              {getDownloadButtonContent()}
            </button>

            {/* 追加オプション（将来の拡張用） */}
            <div className="row">
              <div className="col-6">
                <button 
                  className="btn btn-outline-secondary btn-sm w-100"
                  onClick={() => downloadCsv('dividend')}
                  disabled={isDownloading}
                  type="button"
                >
                  <IconLabel 
                    icon="💰" 
                    label="配当金のみ" 
                    containerClassName="small"
                  />
                </button>
              </div>
              <div className="col-6">
                <button 
                  className="btn btn-outline-secondary btn-sm w-100"
                  onClick={() => downloadCsv('transaction')}
                  disabled={isDownloading}
                  type="button"
                >
                  <IconLabel 
                    icon="📋" 
                    label="取引履歴" 
                    containerClassName="small"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* メッセージ表示 */}
        {message && (
          <Message
            type={message.type}
            content={message.content}
            onClose={clearMessage}
            autoClose={message.type === 'success'}
            duration={3000}
          />
        )}

        {/* 使用方法のヒント */}
        <div className="mt-3">
          <div className="alert alert-info small" role="alert">
            <IconLabel 
              icon="💡" 
              label="ヒント" 
            />
            <div className="mt-1">
              楽天証券のサイトでこの拡張機能を使用してください。
              ページによっては利用できない場合があります。
            </div>
          </div>
        </div>
      </main>

      <Footer version="1.0.0" />

      {/* カスタムスタイル */}
      <style>{`
        .loading-spinner {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .popup-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }
        
        .icon-label {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .alert-custom {
          border-radius: 0.375rem;
          border: 1px solid;
        }
        
        .alert-success-custom {
          color: #0f5132;
          background-color: #d1e7dd;
          border-color: #badbcc;
        }
        
        .alert-danger-custom {
          color: #842029;
          background-color: #f8d7da;
          border-color: #f5c2c7;
        }
        
        .alert-warning-custom {
          color: #664d03;
          background-color: #fff3cd;
          border-color: #ffecb5;
        }
        
        .alert-info-custom {
          color: #055160;
          background-color: #cff4fc;
          border-color: #b6effb;
        }
      `}</style>
    </div>
  );
};

export default RakutenCsvExtensionApp;
