import { useState, useCallback } from 'react';
import type { DownloadResponse, CsvDownloadType, ChromeApiResponse } from '../types';

/**
 * CSVダウンロード状態
 */
interface CsvDownloadState {
  readonly isDownloading: boolean;
  readonly progress?: number;
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
      progress: 0, 
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
        progress: undefined, 
        currentOperation: undefined 
      });
    }
  }, [state.isDownloading, updateState]);

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
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'download-csv-request',
        payload: { 
          selectedOptions: Array.from(selectedOptions), 
          tabId 
        }
      }) as ChromeApiResponse<DownloadResponse>;

      if (!response) {
        throw new Error('バックグラウンドサービスから応答がありません');
      }

      // レスポンスが直接DownloadResponseの場合とChrome APIResponseの場合を処理
      if ('success' in response && typeof response.success === 'boolean') {
        return response as DownloadResponse;
      }

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || '不明なエラーが発生しました');

    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('バックグラウンドサービスとの通信に失敗しました');
    }
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
   * ダウンロードの進捗を手動で更新（外部から呼び出し可能）
   */
  const updateProgress = useCallback((progress: number, operation?: string) => {
    updateState({ progress, currentOperation: operation });
  }, [updateState]);

  /**
   * ダウンロードのキャンセル
   */
  const cancelDownload = useCallback(() => {
    if (state.isDownloading) {
      updateState({ 
        isDownloading: false, 
        progress: undefined, 
        currentOperation: undefined 
      });
      console.log('ダウンロードがキャンセルされました');
    }
  }, [state.isDownloading, updateState]);

  return {
    isDownloading: state.isDownloading,
    progress: state.progress,
    currentOperation: state.currentOperation,
    downloadCsv,
    updateProgress,
    cancelDownload
  };
};
