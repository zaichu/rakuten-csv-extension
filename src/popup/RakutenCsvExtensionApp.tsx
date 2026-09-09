import React, { useState, useCallback } from 'react';
import {
  Header,
  Footer,
  IconLabel,
  Message,
  CategorySection,
  ProgressDisplay,
  SelectionSummary,
  DOWNLOAD_OPTIONS,
  CATEGORIZED_OPTIONS,
  getCategoryLabel,
  getCategoryIcon,
} from '../components';
import { useApplicationMessage, useCsvDownload } from '../hooks';
import { RakutenUtils } from '../utils';
import type { CsvDownloadType } from '../types';
import { ShokenWebUtils } from '../utils/shokenwebUtils';

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
    version: __APP_VERSION__,
    defaultSelectedOptions: [],
    enableBatchOperations: true
  };

  // 選択されたオプションの状態管理
  const [selectedOptions, setSelectedOptions] = useState<Set<CsvDownloadType>>(
    new Set(appConfig.defaultSelectedOptions)
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

  const handleLinkKeyDown = useCallback(
    (handler: () => void) => (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    },
    []
  );

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

  return (
    <div className="popup-container">
      <Header title="楽天証券 CSV取得ツール" icon="📈" />

      <main className="popup-main">
        {/* クイックアクション */}
        <div className="quick-actions">
          <div
            className="link-row"
            onClick={handleOpenRakutenPage}
            role="link"
            tabIndex={0}
            onKeyDown={handleLinkKeyDown(handleOpenRakutenPage)}
          >
            <span aria-hidden="true">🔗</span>
            <span className="link-text">楽天証券を開く</span>
            <span className="link-ext" aria-hidden="true">↗</span>
          </div>
          <div
            className="link-row"
            onClick={handleOpenShokenWebPage}
            role="link"
            tabIndex={0}
            onKeyDown={handleLinkKeyDown(handleOpenShokenWebPage)}
          >
            <span aria-hidden="true">🔗</span>
            <span className="link-text">証券Webを開く</span>
            <span className="link-ext" aria-hidden="true">↗</span>
          </div>
        </div>

        {/* 進捗表示 */}
        <ProgressDisplay
          isDownloading={isDownloading}
          currentOperation={currentOperation}
          progress={progress}
          onCancel={handleCancelDownload}
        />

        {/* 選択状況の表示 */}
        <SelectionSummary
          selectedCount={selectedOptions.size}
          totalCount={DOWNLOAD_OPTIONS.length}
          allSelected={selectedOptions.size === DOWNLOAD_OPTIONS.length}
          isDownloading={isDownloading}
          onSelectAll={handleSelectAll}
        />

        {/* カテゴリ別オプション */}
        {Object.entries(CATEGORIZED_OPTIONS).map(([category, options]) => {
          const selectedInCategory = options.filter(opt => selectedOptions.has(opt.id)).length;
          return (
            <CategorySection
              key={category}
              category={category}
              options={options}
              categoryLabel={getCategoryLabel(category)}
              categoryIcon={getCategoryIcon(category)}
              selectedInCategory={selectedInCategory}
              allInCategorySelected={selectedInCategory === options.length}
              selectedOptions={selectedOptions}
              isDownloading={isDownloading}
              onOptionChange={handleOptionChange}
              onCategoryToggle={handleCategoryToggle}
            />
          );
        })}

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
