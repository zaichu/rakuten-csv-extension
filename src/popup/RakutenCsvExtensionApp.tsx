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
      <Header title="楽天証券 CSV取得ツール" icon="📈" />

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
          <IconLabel icon="🔗" label="楽天証券を開く" />
        </div>

        {/* 取得オプション */}
        <div className="h6">
          <IconLabel icon="📊" label="取得オプション" />
          <div className="mb-3 p-2">
            <div className="form-check">
              <input className="form-check-input" type="checkbox" value="" id="check1" />
              <label className="form-check-label" htmlFor="check1">保有銘柄</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" value="" id="check2" />
              <label className="form-check-label" htmlFor="check2">配当金・分配金</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" value="" id="check3" />
              <label className="form-check-label" htmlFor="check3">国内株式の実現損益</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" value="" id="check4" />
              <label className="form-check-label" htmlFor="check4">投資信託の実現損益</label>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary w-100"
          onClick={handleDownload}
          disabled={isDownloading}
          type="button"
        >
          {getDownloadButtonContent()}
        </button>

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
      </main>

      <Footer version="1.0.0" />
    </div>
  );
};

export default RakutenCsvExtensionApp;
