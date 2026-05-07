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
        <div className="flex items-center">
          <div className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" role="status">
            <span className="sr-only">読み込み中...</span>
          </div>
          <span>{currentOperation || 'ダウンロード中...'}</span>
          {progress !== undefined && (
            <span className="ml-2">({Math.round(progress)}%)</span>
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
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center">
            <IconLabel
              icon={getCategoryIcon(category)}
              label={getCategoryLabel(category)}
              containerClassName="text-sm font-semibold mb-0 flex items-center"
            />
            <span className="inline-block bg-gray-500 text-white text-xs px-1 rounded ml-1" style={{ fontSize: '0.7em' }}>
              {selectedInCategory}/{options.length}
            </span>
          </div>
          <button
            type="button"
            className={`text-xs px-1 py-0.5 rounded border ${allInCategorySelected ? 'border-red-600 text-red-600 hover:bg-red-50' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
            style={{ fontSize: '0.7em', padding: '0.1rem 0.3rem' }}
            onClick={() => handleCategoryToggle(category)}
            disabled={isDownloading}
          >
            {allInCategorySelected ? '全解除' : '全選択'}
          </button>
        </div>

        {/* カテゴリ内のオプション */}
        <div className="border rounded p-2 bg-gray-100">
          {options.map((option) => (
            <div key={option.id} className="flex items-center gap-2 mb-1">
              <input
                className="cursor-pointer"
                type="checkbox"
                id={option.id}
                checked={selectedOptions.has(option.id)}
                onChange={() => handleOptionChange(option.id)}
                disabled={isDownloading}
              />
              <label className="flex items-center w-full cursor-pointer" htmlFor={option.id}>
                <IconLabel
                  icon={option.icon}
                  label={option.label}
                  containerClassName="inline-flex items-center"
                />
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
        <div className="rounded bg-blue-50 text-blue-800 border border-blue-200 py-1 px-2" style={{ fontSize: '0.85em' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="inline-block border-2 border-current border-t-transparent rounded-full animate-spin mr-1" role="status" style={{ width: '0.8rem', height: '0.8rem' }}>
                <span className="sr-only">読み込み中...</span>
              </div>
              <span style={{ fontSize: '0.85em' }}>{currentOperation || 'ダウンロード中...'}</span>
            </div>
            <button
              type="button"
              className="text-xs px-1 py-0.5 rounded border border-red-600 text-red-600 hover:bg-red-50"
              style={{ fontSize: '0.7em', padding: '0.1rem 0.3rem' }}
              onClick={handleCancelDownload}
            >
              キャンセル
            </button>
          </div>
          {progress !== undefined && (
            <div className="overflow-hidden bg-gray-200 rounded mt-1" style={{ height: '4px' }}>
              <div
                className="bg-blue-500 h-full"
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
    const allOptionsCount = DOWNLOAD_OPTIONS.length;
    const selectedCount = selectedOptions.size;
    const allSelected = selectedCount === allOptionsCount;

    return (
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <div className="rounded bg-blue-50 text-blue-800 border border-blue-200 py-1 px-2 grow mr-2 mb-0" style={{ fontSize: '0.85em' }}>
            <small>
              <IconLabel
                icon="📝"
                label={`${selectedCount}件のオプションが選択されています`}
                containerClassName="flex items-center"
              />
            </small>
          </div>
          <button
            type="button"
            className={`text-xs px-1 py-0.5 rounded border ${allSelected ? 'border-red-600 text-red-600 hover:bg-red-50' : 'border-green-600 text-green-600 hover:bg-green-50'}`}
            style={{ fontSize: '0.7em', padding: '0.1rem 0.3rem' }}
            onClick={handleSelectAll}
            disabled={isDownloading}
          >
            {allSelected ? '全解除' : '全選択'}
          </button>
        </div>
      </div>
    );
  }, [selectedOptions.size, handleSelectAll, isDownloading]);

  return (
    <div className="popup-container" style={{ width: '350px', height: 'auto', overflow: 'hidden' }}>
      <Header title="楽天証券 CSV取得ツール" icon="📈" />

      <main className="p-2" style={{ height: 'calc(100% - 60px)', overflowY: 'auto' }}>
        {/* 楽天証券を開くリンク */}
        <div
          className="mb-2 p-1 bg-gray-100 rounded cursor-pointer border"
          onClick={handleOpenRakutenPage}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenRakutenPage()}
        >
          <IconLabel
            icon="🔗"
            label="楽天証券を開く"
            containerClassName="text-blue-600 flex items-center"
          />
        </div>

        {/* 証券Webを開くリンク */}
        <div
          className="mb-2 p-1 bg-gray-100 rounded cursor-pointer border"
          onClick={handleOpenShokenWebPage}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleOpenShokenWebPage()}
        >
          <IconLabel
            icon="🔗"
            label="証券Webを開く"
            containerClassName="text-blue-600 flex items-center"
          />
        </div>

        {/* 進捗表示 */}
        {renderProgressDisplay()}

        {/* 選択状況の表示 */}
        {renderSelectionSummary()}

        {/* 取得オプションセクション */}
        <div className="mb-2">
          {/* カテゴリ別オプション表示 */}
          {Object.entries(CATEGORIZED_OPTIONS).map(([category, options]) =>
            renderCategoryOptions(category, options)
          )}
        </div>

        {/* ダウンロードボタン */}
        <div className="mb-2">
          <button
            className={`w-full py-1 rounded text-white ${selectedOptions.size > 0 && !isDownloading
              ? 'bg-blue-600 hover:bg-blue-700'
              : 'bg-gray-500'
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
