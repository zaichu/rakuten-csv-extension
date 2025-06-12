import { useState, useCallback } from 'react';
import type { DownloadResponse, CsvDownloadType } from '../types';

/**
 * CSVダウンロード機能フック（Background経由）
 */
export const useCsvDownload = () => {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const downloadCsv = useCallback(async (
    downloadType: CsvDownloadType
  ): Promise<DownloadResponse> => {
    setIsDownloading(true);
    console.log(`CSVダウンロード開始: ${downloadType}`);

    try {
      // アクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('アクティブなタブ:', tab);

      if (!tab?.id) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // 楽天証券のサイトかどうかチェック
      if (!tab.url?.includes('rakuten-sec.co.jp')) {
        console.log('現在のURL:', tab.url);
        return {
          success: false,
          error: '楽天証券のサイトで使用してください'
        };
      }

      console.log('バックグラウンドサービスにリクエストを送信中...');
      
      // バックグラウンドサービスにダウンロードリクエストを送信
      const response = await chrome.runtime.sendMessage({
        action: 'download-csv-request',
        payload: {
          downloadType,
          tabId: tab.id
        }
      }) as DownloadResponse;

      console.log('バックグラウンドサービスからの応答:', response);
      return response;
    } catch (error) {
      console.error(`CSVダウンロードエラー (${downloadType}):`, error);
      
      let errorMessage = 'エラーが発生しました。';
      
      if (error instanceof Error) {
        if (error.message.includes('Could not establish connection')) {
          errorMessage = 'バックグラウンドサービスとの接続に失敗しました。拡張機能を再読み込みしてください。';
        } else if (error.message.includes('Extension context invalidated')) {
          errorMessage = '拡張機能を再読み込みしてください。';
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return {
    isDownloading,
    downloadCsv
  };
};
