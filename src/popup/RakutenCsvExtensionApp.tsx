import React, { useState, useCallback, useMemo } from 'react';
import { Header, Footer, IconLabel, Message } from '../components';
import { useApplicationMessage, useCsvDownload } from '../hooks';
import { RakutenUtils } from '../utils';
import type { CsvDownloadType } from '../types';
import 'bootstrap/dist/css/bootstrap.min.css';
import { ShokenWebUtils } from '../utils/shokenwebUtils';

/**
 * CSV ダウンロードオプション
 */
interface DownloadOption {
  readonly id: CsvDownloadType;
  readonly label: string;
  readonly icon: string;
  readonly category: 'portfolio' | 'transaction' | 'income';
}

/**
 * アプリケーションの設定
 */
interface AppConfig {
  readonly version: string;
  readonly defaultSelectedOptions: readonly CsvDownloadType[];
  readonly enableBatchOperations: boolean;
}

/**
 * 楽天証券CSV拡張機能のメインアプリケーション
 * 完全にリファクタリングされたバージョン
 */
const RakutenCsvExtensionApp: React.FC = () => {
  const { message, showError, showSuccess, clearMessage } = useApplicationMessage();
  const {
    isDownloading,
    currentOperation,
    progress,
    downloadCsv,
    cancelDownload
  } = useCsvDownload();

  // アプリケーション設定
  const appConfig: AppConfig = {
    version: '1.0.0',
    defaultSelectedOptions: [],
    enableBatchOperations: true
  };

  // ダウンロードオプションの定義（useMemoで最適化）
  const downloadOptions: readonly DownloadOption[] = useMemo(() => [
    {
      id: 'assetbalance',
      label: '国内株式',
      icon: '📊',
      category: 'portfolio'
    },
    {
      id: 'dividend',
      label: '配当金・分配金',
      icon: '💰',
      category: 'income'
    },
    {
      id: 'domesticstock',
      label: '国内株式',
      icon: '📋',
      category: 'transaction'
    },
    {
      id: 'mutualfund',
      label: '投資信託',
      icon: '📋',
      category: 'transaction'
    }
  ], []);

  // 選択されたオプションの状態管理
  const [selectedOptions, setSelectedOptions] = useState<Set<CsvDownloadType>>(
    new Set(appConfig.defaultSelectedOptions)
  );

  /**
   * カテゴリ別のオプションを取得
   */
  const categorizedOptions = useMemo(() => {
    const categories = downloadOptions.reduce((acc, option) => {
      if (!acc[option.category]) {
        acc[option.category] = [];
      }
      acc[option.category].push(option);
      return acc;
    }, {} as Record<string, DownloadOption[]>);

    return categories;
  }, [downloadOptions]);

  /**
   * カテゴリの表示名を取得
   */
  const getCategoryLabel = useCallback((category: string): string => {
    const labels: Record<string, string> = {
      portfolio: 'ポートフォリオ',
      transaction: '取引履歴',
      income: '収益情報'
    };
    return labels[category] || category;
  }, []);

  /**
   * カテゴリのアイコンを取得
   */
  const getCategoryIcon = useCallback((category: string): string => {
    const icons: Record<string, string> = {
      portfolio: '📈',
      transaction: '📊',
      income: '💰'
    };
    return icons[category] || '📋';
  }, []);

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
  }, []);

  /**
   * カテゴリ全体の選択/解除
   */
  const handleCategoryToggle = useCallback((category: string) => {
    const categoryOptions = categorizedOptions[category]?.map(opt => opt.id) || [];
    const allSelected = categoryOptions.every(id => selectedOptions.has(id));

    setSelectedOptions(prev => {
      const newSet = new Set(prev);

      if (allSelected) {
        // 全て選択されている場合は解除
        categoryOptions.forEach(id => newSet.delete(id));
      } else {
        // 一部または未選択の場合は全て選択
        categoryOptions.forEach(id => newSet.add(id));
      }

      return newSet;
    });
  }, [categorizedOptions, selectedOptions]);

  /**
   * 全選択/全解除の処理
   */
  const handleSelectAll = useCallback(() => {
    const allOptions = downloadOptions.map(opt => opt.id);
    const allSelected = allOptions.every(id => selectedOptions.has(id));

    if (allSelected) {
      setSelectedOptions(new Set());
    } else {
      setSelectedOptions(new Set(allOptions));
    }
  }, [downloadOptions, selectedOptions]);

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
      const result = await downloadCsv(selectedOptions);

      if (result.success) {
        showSuccess(result.message || 'CSVダウンロードが完了しました');

        // 成功時は選択をクリア（オプション）
        if (appConfig.enableBatchOperations) {
          setSelectedOptions(new Set());
        }
      } else {
        showError(result.error || 'ダウンロードに失敗しました');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : '予期しないエラーが発生しました');
    }
  }, [selectedOptions, downloadCsv, clearMessage, showError, showSuccess, appConfig.enableBatchOperations]);

  /**
   * ダウンロードのキャンセル処理
   */
  const handleCancelDownload = useCallback(() => {
    cancelDownload();
    showError('ダウンロードがキャンセルされました');
  }, [cancelDownload, showError]);

  /**
   * 楽天証券ページを開く
   */
  const handleOpenRakutenPage = useCallback((): void => {
    RakutenUtils.openRakutenPage();
  }, []);

  /**
   * 証券Webページを開く
   */
  const handleOpenShokenWebPage = useCallback((): void => {
    ShokenWebUtils.openShokenWebPage();
  }, []);

  /**
   * ダウンロードボタンの内容を取得
   */
  const getDownloadButtonContent = useCallback(() => {
    if (isDownloading) {
      return (
        <div className="d-flex align-items-center">
          <div className="spinner-border spinner-border-sm me-2" role="status">
            <span className="visually-hidden">読み込み中...</span>
          </div>
          <span>{currentOperation || 'ダウンロード中...'}</span>
          {progress !== undefined && (
            <span className="ms-2">({Math.round(progress)}%)</span>
          )}
        </div>
      );
    }

    const selectedCount = selectedOptions.size;
    const label = selectedCount > 0 ? `CSV ダウンロード (${selectedCount}件)` : 'CSV ダウンロード';
    return <IconLabel icon="💾" label={label} />;
  }, [isDownloading, currentOperation, progress, selectedOptions.size]);

  /**
   * カテゴリ別オプションのレンダリング
   */
  const renderCategoryOptions = useCallback((category: string, options: readonly DownloadOption[]) => {
    const selectedInCategory = options.filter(opt => selectedOptions.has(opt.id)).length;
    const allInCategorySelected = selectedInCategory === options.length;

    return (
      <div key={category} className="mb-2">
        {/* カテゴリヘッダー */}
        <div className="d-flex align-items-center justify-content-between mb-1">
          <div className="d-flex align-items-center">
            <IconLabel
              icon={getCategoryIcon(category)}
              label={getCategoryLabel(category)}
              containerClassName="h6 mb-0 d-flex align-items-center"
            />
            <span className="badge bg-secondary ms-1" style={{ fontSize: '0.7em' }}>
              {selectedInCategory}/{options.length}
            </span>
          </div>
          <button
            type="button"
            className={`btn btn-xs ${allInCategorySelected ? 'btn-outline-danger' : 'btn-outline-primary'}`}
            style={{ fontSize: '0.7em', padding: '0.1rem 0.3rem' }}
            onClick={() => handleCategoryToggle(category)}
            disabled={isDownloading}
          >
            {allInCategorySelected ? '全解除' : '全選択'}
          </button>
        </div>

        {/* カテゴリ内のオプション */}
        <div className="border rounded p-2 bg-light">
          {options.map((option) => (
            <div key={option.id} className="form-check mb-1">
              <input
                className="form-check-input"
                type="checkbox"
                id={option.id}
                checked={selectedOptions.has(option.id)}
                onChange={() => handleOptionChange(option.id)}
                disabled={isDownloading}
              />
              <label className="form-check-label w-100" htmlFor={option.id}>
                <div className="d-flex align-items-center">
                  <IconLabel
                    icon={option.icon}
                    label={option.label}
                    containerClassName="d-inline-flex align-items-center"
                  />
                </div>
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  }, [selectedOptions, isDownloading, getCategoryIcon, getCategoryLabel, handleOptionChange, handleCategoryToggle]);

  /**
   * 進捗表示のレンダリング
   */
  const renderProgressDisplay = useCallback(() => {
    if (!isDownloading) return null;

    return (
      <div className="mb-2">
        <div className="alert alert-info py-1" style={{ fontSize: '0.85em' }}>
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <div className="spinner-border spinner-border-sm me-1" role="status" style={{ width: '0.8rem', height: '0.8rem' }}>
                <span className="visually-hidden">読み込み中...</span>
              </div>
              <span style={{ fontSize: '0.85em' }}>{currentOperation || 'ダウンロード中...'}</span>
            </div>
            <button
              type="button"
              className="btn btn-xs btn-outline-danger"
              style={{ fontSize: '0.7em', padding: '0.1rem 0.3rem' }}
              onClick={handleCancelDownload}
            >
              キャンセル
            </button>
          </div>
          {progress !== undefined && (
            <div className="progress mt-1" style={{ height: '4px' }}>
              <div
                className="progress-bar"
                role="progressbar"
                style={{ width: `${progress}%` }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}
        </div>
      </div>
    );
  }, [isDownloading, currentOperation, progress, handleCancelDownload]);

  /**
   * 選択状況の表示
   */
  const renderSelectionSummary = useCallback(() => {
    const allOptionsCount = downloadOptions.length;
    const selectedCount = selectedOptions.size;
    const allSelected = selectedCount === allOptionsCount;

    return (
      <div className="mb-3">
        <div className="d-flex align-items-center justify-content-between">
          <div className="alert alert-info py-1 flex-grow-1 me-2 mb-0" style={{ fontSize: '0.85em' }}>
            <small>
              <IconLabel
                icon="📝"
                label={`${selectedCount}件のオプションが選択されています`}
                containerClassName="d-flex align-items-center"
              />
            </small>
          </div>
          <button
            type="button"
            className={`btn btn-xs ${allSelected ? 'btn-outline-danger' : 'btn-outline-success'}`}
            style={{ fontSize: '0.7em', padding: '0.1rem 0.3rem' }}
            onClick={handleSelectAll}
            disabled={isDownloading}
          >
            {allSelected ? '全解除' : '全選択'}
          </button>
        </div>
      </div>
    );
  }, [downloadOptions.length, selectedOptions.size, handleSelectAll, isDownloading]);

  return (
    <div className="popup-container" style={{ width: '350px', height: 'auto', overflow: 'hidden' }}>
      <Header title="楽天証券 CSV取得ツール" icon="📈" />

      <main className="p-2" style={{ height: 'calc(100% - 60px)', overflowY: 'auto' }}>
        {/* 楽天証券を開くリンク */}
        <div
          className="mb-2 p-1 bg-light rounded cursor-pointer border"
          onClick={handleOpenRakutenPage}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenRakutenPage()}
        >
          <IconLabel
            icon="🔗"
            label="楽天証券を開く"
            containerClassName="text-primary d-flex align-items-center"
          />
        </div>

        {/* 証券Webを開くリンク */}
        <div
          className="mb-2 p-1 bg-light rounded cursor-pointer border"
          onClick={handleOpenShokenWebPage}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenShokenWebPage()}
        >
          <IconLabel
            icon="🔗"
            label="証券Webを開く"
            containerClassName="text-primary d-flex align-items-center"
          />
        </div>

        {/* 進捗表示 */}
        {renderProgressDisplay()}

        {/* 選択状況の表示 */}
        {renderSelectionSummary()}

        {/* 取得オプションセクション */}
        <div className="mb-2">
          {/* カテゴリ別オプション表示 */}
          {Object.entries(categorizedOptions).map(([category, options]) =>
            renderCategoryOptions(category, options)
          )}
        </div>

        {/* ダウンロードボタン */}
        <div className="d-grid mb-2">
          <button
            className={`btn ${selectedOptions.size > 0 && !isDownloading
              ? 'btn-primary'
              : 'btn-secondary'
              }`}
            onClick={handleDownload}
            disabled={isDownloading || selectedOptions.size === 0}
            type="button"
          >
            {getDownloadButtonContent()}
          </button>
        </div>

        {/* メッセージ表示 */}
        {message && (
          <div className="mb-2">
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

      <Footer version={appConfig.version} />
    </div>
  );
};

export default RakutenCsvExtensionApp;
