import React, { useState, useCallback } from 'react';
import { Header, Footer, IconLabel, Message } from '../components';
import { useApplicationMessage, useCsvDownload } from '../hooks';
import { RakutenUtils } from '../utils';
import type { CsvDownloadType } from '../types';
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
 * ダウンロードオプションの定義
 */
const DOWNLOAD_OPTIONS: readonly DownloadOption[] = [
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
] as const;

/**
 * カテゴリ別にグループ化されたオプション
 */
const CATEGORIZED_OPTIONS: Record<string, DownloadOption[]> = {
  portfolio: DOWNLOAD_OPTIONS.filter(opt => opt.category === 'portfolio'),
  income: DOWNLOAD_OPTIONS.filter(opt => opt.category === 'income'),
  transaction: DOWNLOAD_OPTIONS.filter(opt => opt.category === 'transaction')
};

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
    version: __APP_VERSION__,
    defaultSelectedOptions: [],
    enableBatchOperations: true
  };

  // 選択されたオプションの状態管理
  const [selectedOptions, setSelectedOptions] = useState<Set<CsvDownloadType>>(
    new Set(appConfig.defaultSelectedOptions)
  );


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
    const categoryOptions = CATEGORIZED_OPTIONS[category]?.map(opt => opt.id) || [];
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
  }, [selectedOptions]);

  /**
   * 全選択/全解除の処理
   */
  const handleSelectAll = useCallback(() => {
    const allOptions = DOWNLOAD_OPTIONS.map(opt => opt.id);
    const allSelected = allOptions.every(id => selectedOptions.has(id));

    if (allSelected) {
      setSelectedOptions(new Set());
    } else {
      setSelectedOptions(new Set(allOptions));
    }
  }, [selectedOptions]);

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
  const handleOpenShokenWebPage = useCallback(async (): Promise<void> => {
    try {
      await ShokenWebUtils.openShokenWebPage();
    } catch (error) {
      console.error('証券Webページを開く際にエラーが発生しました:', error);
    }
  }, []);

  /**
   * ダウンロードボタンの内容を取得
   */
  const getDownloadButtonContent = useCallback(() => {
    if (isDownloading) {
      return (
        <>
          <span className="spinner-xs" role="status"><span className="sr-only">読み込み中...</span></span>
          <span>{currentOperation || 'ダウンロード中...'}</span>
          {progress !== undefined && <span>({Math.round(progress)}%)</span>}
        </>
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
      <div key={category} className="category-section" data-category={category}>
        <div className="category-header">
          <div className="category-title">
            <span>{getCategoryIcon(category)}</span>
            <span>{getCategoryLabel(category)}</span>
            <span className="category-count">{selectedInCategory}/{options.length}</span>
          </div>
          <button
            type="button"
            className={allInCategorySelected ? 'tog-off' : 'tog-on'}
            onClick={() => handleCategoryToggle(category)}
            disabled={isDownloading}
          >
            {allInCategorySelected ? '全解除' : '全選択'}
          </button>
        </div>

        <div className="category-body">
          {options.map((option) => (
            <div key={option.id} className={`option-row${selectedOptions.has(option.id) ? ' option-row-selected' : ''}`}>
              <input
                type="checkbox"
                id={option.id}
                checked={selectedOptions.has(option.id)}
                onChange={() => handleOptionChange(option.id)}
                disabled={isDownloading}
              />
              <label htmlFor={option.id}>
                <IconLabel icon={option.icon} label={option.label} />
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
      <div className="progress-notice">
        <div className="progress-row">
          <div className="progress-label">
            <span className="spinner-xs" role="status"><span className="sr-only">読み込み中...</span></span>
            <span>{currentOperation || 'ダウンロード中...'}</span>
          </div>
          <button
            type="button"
            className="tog-off"
            onClick={handleCancelDownload}
          >
            キャンセル
          </button>
        </div>
        {progress !== undefined && (
          <div className="progress-track">
            <div
              className="progress-fill"
              role="progressbar"
              style={{ width: `${progress}%` }}
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}
      </div>
    );
  }, [isDownloading, currentOperation, progress, handleCancelDownload]);

  /**
   * 選択状況の表示
   */
  const renderSelectionSummary = useCallback(() => {
    const allOptionsCount = DOWNLOAD_OPTIONS.length;
    const selectedCount = selectedOptions.size;
    const allSelected = selectedCount === allOptionsCount;

    return (
      <div className="selection-summary">
        <div className="selection-info">
          <span>選択中 <strong className="text-blue-700 font-bold">{selectedCount}</strong> / {allOptionsCount}</span>
        </div>
        <button
          type="button"
          className={allSelected ? 'tog-all-off' : 'tog-all-on'}
          onClick={handleSelectAll}
          disabled={isDownloading}
        >
          {allSelected ? '全解除' : '全選択'}
        </button>
      </div>
    );
  }, [selectedOptions.size, handleSelectAll, isDownloading]);

  return (
    <div className="popup-container">
      <Header title="楽天証券 CSV取得ツール" icon="📈" />

      <main className="popup-main">
        {/* クイックアクション */}
        <div className="quick-actions">
          <div
            className="link-row"
            onClick={handleOpenRakutenPage}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenRakutenPage()}
          >
            <span>🔗</span>
            <span>楽天証券を開く</span>
          </div>
          <div
            className="link-row"
            onClick={handleOpenShokenWebPage}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenShokenWebPage()}
          >
            <span>🔗</span>
            <span>証券Webを開く</span>
          </div>
        </div>

        {/* 進捗表示 */}
        {renderProgressDisplay()}

        {/* 選択状況の表示 */}
        {renderSelectionSummary()}

        {/* カテゴリ別オプション */}
        {Object.entries(CATEGORIZED_OPTIONS).map(([category, options]) =>
          renderCategoryOptions(category, options)
        )}

        {/* ダウンロードボタン */}
        <div className="mb-2 mt-1">
          <button
            className={selectedOptions.size > 0 && !isDownloading ? 'cta-active' : 'cta-disabled'}
            onClick={handleDownload}
            disabled={isDownloading || selectedOptions.size === 0}
            type="button"
          >
            {getDownloadButtonContent()}
          </button>
        </div>

        {/* メッセージ表示 */}
        {message && (
          <div className="mb-1">
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
