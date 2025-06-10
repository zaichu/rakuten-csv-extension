import { useState, useCallback } from 'react';
import type { DownloadResponse, CsvDownloadType } from '../types';

/**
 * CSVダウンロード機能フック
 */
export const useCsvDownload = () => {
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const downloadCsv = useCallback(async (
    downloadType: CsvDownloadType
  ): Promise<DownloadResponse> => {
    setIsDownloading(true);

    try {
      // アクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('アクティブなタブが見つかりません');
      }

      // 楽天証券のサイトかどうかチェック
      if (!tab.url?.includes('rakuten-sec.co.jp')) {
        return {
          success: false,
          error: '楽天証券のサイトで使用してください'
        };
      }

      // コンテンツスクリプトにメッセージを送信
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'download-csv',
        payload: {
          message: '楽天証券の取引データをCSV形式でダウンロードします',
          downloadType
        }
      }) as DownloadResponse;

      return response;
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      return {
        success: false,
        error: 'エラーが発生しました。ページを再読み込みして再試行してください。'
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
