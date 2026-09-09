import { useState, useCallback, useEffect, useRef } from 'react';
import type { ApplicationMessage, MessageType } from '../types';

/**
 * メッセージ管理の設定
 */
interface MessageConfig {
  readonly autoCloseDuration?: number;
}

/**
 * アプリケーションメッセージ管理のカスタムフック
 * メッセージの表示、自動削除を提供
 */
export const useApplicationMessage = (config: MessageConfig = {}) => {
  const {
    autoCloseDuration = 5000
  } = config;

  const [message, setMessage] = useState<ApplicationMessage | null>(null);
  const timeoutRef = useRef<number | null>(null);

  /**
   * タイマーをクリア
   */
  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * メッセージを表示
   */
  const showMessage = useCallback((
    type: MessageType,
    content: string,
    options: {
      autoClose?: boolean;
      duration?: number;
    } = {}
  ) => {
    const {
      autoClose = type === 'success' || type === 'info',
      duration = autoCloseDuration
    } = options;

    const newMessage: ApplicationMessage = {
      type,
      content,
      timestamp: new Date()
    };

    // 既存のメッセージを置き換え
    clearTimer();
    setMessage(newMessage);

    if (autoClose) {
      timeoutRef.current = window.setTimeout(() => {
        setMessage(null);
      }, duration);
    }
  }, [autoCloseDuration, clearTimer]);

  /**
   * メッセージをクリア
   */
  const clearMessage = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  /**
   * 成功メッセージを表示
   */
  const showSuccess = useCallback((content: string, options?: Parameters<typeof showMessage>[2]) => {
    showMessage('success', content, options);
  }, [showMessage]);

  /**
   * エラーメッセージを表示
   */
  const showError = useCallback((content: string, options?: Parameters<typeof showMessage>[2]) => {
    showMessage('error', content, { autoClose: false, ...options });
  }, [showMessage]);

  /**
   * クリーンアップ
   */
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  /**
   * メッセージの存在チェック
   */
  const hasMessage = message !== null;

  return {
    // 現在のメッセージ
    message,
    hasMessage,

    // メッセージ操作
    showMessage,
    clearMessage,

    // 便利メソッド
    showSuccess,
    showError
  };
};
