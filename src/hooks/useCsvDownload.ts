import { useState, useCallback } from 'react';
import type { DownloadResponse, CsvDownloadType, CsvDownloadMessage } from '../types';

function isDownloadResponse(value: unknown): value is DownloadResponse {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).success === 'boolean';
}

/**
 * CSVダウンロード状態
 */
interface CsvDownloadState {
  readonly isDownloading: boolean;
  readonly currentOperation?: string;
}

/**
 * CSVダウンロード機能のカスタムフック
 * バックグラウンドサービスとの通信を管理
 */
export const useCsvDownload = () => {
  const [state, setState] = useState<CsvDownloadState>({
    isDownloading: false
  });

  /**
   * ダウンロード状態の更新
   */
  const updateState = useCallback((newState: Partial<CsvDownloadState>) => {
    setState(prevState => ({ ...prevState, ...newState }));
  }, []);

  /**
   * アクティブなタブを取得
   */
  const getActiveTab = async (): Promise<{ id: number; url: string }> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id || !tab.url) {
      throw new Error('アクティブなタブが見つかりません');
    }

    console.log('アクティブなタブ:', { id: tab.id, url: tab.url });
    return { id: tab.id, url: tab.url };
  };

  /**
   * 楽天証券サイトの検証
   */
  const validateRakutenSite = (url?: string): void => {
    if (!url?.includes('rakuten-sec.co.jp')) {
      console.log('現在のURL:', url);
      throw new Error('楽天証券のサイトで使用してください');
    }
  };

  /**
   * ダウンロードリクエストの送信
   */
  const sendDownloadRequest = async (
    selectedOptions: Set<CsvDownloadType>, 
    tabId: number
  ): Promise<DownloadResponse> => {
    const message: CsvDownloadMessage = {
      action: 'download-csv-request',
      payload: {
        selectedOptions: Array.from(selectedOptions),
        tabId
      }
    };
    const rawResponse: unknown = await chrome.runtime.sendMessage(message);

    if (!rawResponse) {
      throw new Error('バックグラウンドサービスから応答がありません');
    }

    if (isDownloadResponse(rawResponse)) {
      return rawResponse;
    }

    return { success: false, error: '不正なレスポンス形式です' };
  };

  /**
   * ダウンロードエラーの処理
   */
  const handleDownloadError = (error: unknown): DownloadResponse => {
    let errorMessage = 'エラーが発生しました。';

    if (error instanceof Error) {
      if (error.message.includes('Could not establish connection')) {
        errorMessage = 'バックグラウンドサービスとの接続に失敗しました。拡張機能を再読み込みしてください。';
      } else if (error.message.includes('Extension context invalidated')) {
        errorMessage = '拡張機能を再読み込みしてください。';
      } else if (error.message.includes('楽天証券')) {
        errorMessage = error.message;
      } else if (error.message.includes('選択されていません')) {
        errorMessage = error.message;
      } else {
        errorMessage = `予期しないエラー: ${error.message}`;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return {
      success: false,
      error: errorMessage
    };
  };

  /**
   * CSVダウンロードの実行
   */
  const downloadCsv = useCallback(async (
    selectedOptions: Set<CsvDownloadType>
  ): Promise<DownloadResponse> => {
    if (state.isDownloading) {
      return { success: false, error: 'ダウンロードが既に実行中です' };
    }

    updateState({ 
      isDownloading: true, 
      currentOperation: 'ダウンロード準備中...' 
    });

    console.log(`CSVダウンロード開始: ${Array.from(selectedOptions).join(', ')}`);

    try {
      // 空の選択チェック
      if (selectedOptions.size === 0) {
        throw new Error('ダウンロードオプションが選択されていません');
      }

      // アクティブなタブを取得
      const activeTab = await getActiveTab();
      
      // 楽天証券のサイトかどうかチェック
      validateRakutenSite(activeTab.url);

      updateState({ currentOperation: 'バックグラウンドサービスと通信中...' });

      // バックグラウンドサービスにダウンロードリクエストを送信
      const response = await sendDownloadRequest(selectedOptions, activeTab.id);

      console.log('バックグラウンドサービスからの応答:', response);
      return response;

    } catch (error) {
      console.error(`CSVダウンロードエラー:`, error);
      return handleDownloadError(error);
    } finally {
      updateState({ 
        isDownloading: false, 
        currentOperation: undefined 
      });
    }
  }, [state.isDownloading, updateState]);

  return {
    isDownloading: state.isDownloading,
    currentOperation: state.currentOperation,
    downloadCsv
  };
};
