import React, { useState, useCallback } from 'react';
import { Header, Footer, IconLabel, Message } from '../components';
import { useApplicationMessage, useCsvDownload } from '../hooks';
import { RakutenUtils } from '../utils';
import type { CsvDownloadType } from '../types';
import 'bootstrap/dist/css/bootstrap.min.css';

/**
 * CSV ダウンロードオプション
 */
interface DownloadOption {
  id: CsvDownloadType;
  label: string;
  icon: string;
  description: string;
}

/**
 * 楽天証券CSV拡張機能のメインアプリケーション
 */
const RakutenCsvExtensionApp: React.FC = () => {
  const { message, showSuccess, showError, clearMessage } = useApplicationMessage();
  const { isDownloading, downloadCsv } = useCsvDownload();

  // ダウンロードオプションの定義
  const downloadOptions: DownloadOption[] = [
    {
      id: 'assetbalance',
      label: '保有銘柄',
      icon: '📊',
      description: 'ポートフォリオの保有銘柄データ'
    },
    {
      id: 'dividend',
      label: '配当金・分配金',
      icon: '💰',
      description: '配当金・分配金の履歴'
    },
    {
      id: 'domesticstock',
      label: '国内株式',
      icon: '📋',
      description: '国内株式の取引履歴'
    },
    {
      id: 'mutualfund',
      label: '投資信託',
      icon: '📋',
      description: '投資信託の取引履歴'
    }
  ];

  // チェックボックスの状態管理（デフォルトすべてON）
  const [selectedOptions, setSelectedOptions] = useState<Set<CsvDownloadType>>(
    // new Set(downloadOptions.map(option => option.id))
    new Set()
  );

  /**
   * 個別チェックボックスの変更処理
   */
  const handleOptionChange = useCallback((optionId: CsvDownloadType) => {
    setSelectedOptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(optionId)) {
        newSet.delete(optionId);
      } else {
        newSet.add(optionId);
      }

      return newSet;
    });
  }, [downloadOptions.length]);

  /**
   * CSVダウンロード処理
   */
  const handleDownload = useCallback(async (): Promise<void> => {
    clearMessage();

    if (selectedOptions.size === 0) {
      showError('ダウンロードするオプションを選択してください');
      return;
    }

    try {
      let successCount = 0;
      let errorCount = 0;

      // 選択されたオプションに基づいてダウンロードタイプを決定
      for (const downloadType of selectedOptions) {
        const response = await downloadCsv(downloadType);

        if (response.success) {
          successCount++;
          console.log(`${downloadType}のCSVダウンロードが成功しました`);
        } else {
          errorCount++;
          console.error(`${downloadType}のCSVダウンロードが失敗しました:`, response.error);
        }
      }

      if (successCount > 0) {
        showSuccess(`${successCount}件のCSVダウンロードを開始しました`);
      }

      if (errorCount > 0) {
        showError(`${errorCount}件のCSVダウンロードに失敗しました`);
      }
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      showError('予期しないエラーが発生しました');
    }
  }, [selectedOptions, downloadCsv, showSuccess, showError, clearMessage]);

  /**
   * 楽天証券ページを開く
   */
  const handleOpenRakutenPage = useCallback((): void => {
    RakutenUtils.openRakutenPage();
  }, []);

  /**
   * ダウンロードボタンの内容を取得
   */
  const getDownloadButtonContent = useCallback(() => {
    if (isDownloading) {
      return <IconLabel icon="⟳" label="ダウンロード中..." iconClassName="loading-spinner" />
    }

    const selectedCount = selectedOptions.size;
    const label = selectedCount > 0 ? `CSV ダウンロード (${selectedCount}件)` : 'CSV ダウンロード';
    return <IconLabel icon="💾" label={label} />
  }, [isDownloading, selectedOptions.size]);

  /**
   * オプション選択エリアのレンダリング
   */
  const renderDownloadOptions = () => (
    <div className="download-options">
      {/* 個別オプション */}
      {downloadOptions.map((option) => (
        <div key={option.id} className="form-check mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id={option.id}
            checked={selectedOptions.has(option.id)}
            onChange={() => handleOptionChange(option.id)}
            disabled={isDownloading}
          />
          <label className="form-check-label" htmlFor={option.id}>
            <div className="d-flex align-items-center">
              <IconLabel icon={option.icon} label={option.label} containerClassName="d-inline-flex align-items-center"
              />
            </div>
            <small className="text-muted d-block ms-4">
              {option.description}
            </small>
          </label>
        </div>
      ))}
    </div>
  );

  return (
    <div className="popup-container" style={{ width: '350px', minHeight: '400px' }}>
      <Header title="楽天証券 CSV取得ツール" icon="📈" />

      <main className="p-3">
        {/* 楽天証券を開くリンク */}
        <div
          className="mb-3 p-2 bg-light rounded cursor-pointer"
          onClick={handleOpenRakutenPage}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenRakutenPage()}
        >
          <IconLabel icon="🔗" label="楽天証券を開く" containerClassName="text-primary d-flex align-items-center" />
        </div>

        {/* 取得オプションセクション */}
        <div className="mb-3">
          <div className="h6">
            <IconLabel icon="📊" label="取得オプション" containerClassName="d-flex align-items-center" />
          </div>

          <div className="border rounded p-3 bg-light">
            {renderDownloadOptions()}
          </div>
        </div>

        {/* 選択状況の表示 */}
        <div className="mb-3">
          <div className="alert alert-info py-2">
            <small>
              <IconLabel icon="📝" label={`${selectedOptions.size}件のオプションが選択されています`} containerClassName="d-flex align-items-center" />
            </small>
          </div>
        </div>

        {/* ダウンロードボタン */}
        <div className="d-grid mb-3">
          <button
            className={`btn btn-lg ${selectedOptions.size > 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleDownload}
            disabled={isDownloading || selectedOptions.size === 0}
            type="button"
          >
            {getDownloadButtonContent()}
          </button>
        </div>

        {/* メッセージ表示 */}
        {message && (
          <div className="mb-3">
            <Message
              type={message.type}
              content={message.content}
              onClose={clearMessage}
              autoClose={message.type === 'success'}
              duration={3000}
            />
          </div>
        )}
      </main>

      <Footer version="1.0.0" />
    </div>
  );
};

export default RakutenCsvExtensionApp;
