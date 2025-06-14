import { useState, useCallback, useEffect, useRef } from 'react';
import type { ApplicationMessage, MessageType } from '../types';

/**
 * メッセージ管理の設定
 */
interface MessageConfig {
  readonly autoCloseDuration?: number;
  readonly maxMessages?: number;
  readonly enableQueue?: boolean;
}

/**
 * メッセージキューの項目
 */
interface QueuedMessage extends ApplicationMessage {
  readonly id: string;
  readonly autoClose?: boolean;
  readonly duration?: number;
}

/**
 * アプリケーションメッセージ管理のカスタムフック
 * メッセージの表示、自動削除、キュー管理を提供
 */
export const useApplicationMessage = (config: MessageConfig = {}) => {
  const {
    autoCloseDuration = 5000,
    maxMessages = 1,
    enableQueue = false
  } = config;

  const [message, setMessage] = useState<ApplicationMessage | null>(null);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const messageIdCounter = useRef(0);

  /**
   * 一意のメッセージIDを生成
   */
  const generateMessageId = useCallback((): string => {
    return `msg_${Date.now()}_${++messageIdCounter.current}`;
  }, []);

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
      replace?: boolean;
    } = {}
  ) => {
    const {
      autoClose = type === 'success' || type === 'info',
      duration = autoCloseDuration,
      replace = !enableQueue
    } = options;

    const newMessage: QueuedMessage = {
      id: generateMessageId(),
      type,
      content,
      timestamp: new Date(),
      autoClose,
      duration
    };

    if (replace || !enableQueue) {
      // 既存のメッセージを置き換え
      clearTimer();
      setMessage(newMessage);
      setMessageQueue([]);

      if (autoClose) {
        timeoutRef.current = window.setTimeout(() => {
          setMessage(null);
        }, duration);
      }
    } else {
      // キューに追加
      setMessageQueue(prev => {
        const newQueue = [...prev, newMessage];
        return newQueue.slice(-maxMessages); // 最大数を超えた場合は古いものを削除
      });
    }
  }, [autoCloseDuration, enableQueue, maxMessages, generateMessageId, clearTimer]);

  /**
   * メッセージをクリア
   */
  const clearMessage = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  /**
   * 全てのメッセージをクリア
   */
  const clearAllMessages = useCallback(() => {
    clearTimer();
    setMessage(null);
    setMessageQueue([]);
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
   * 警告メッセージを表示
   */
  const showWarning = useCallback((content: string, options?: Parameters<typeof showMessage>[2]) => {
    showMessage('warning', content, { autoClose: false, ...options });
  }, [showMessage]);

  /**
   * 情報メッセージを表示
   */
  const showInfo = useCallback((content: string, options?: Parameters<typeof showMessage>[2]) => {
    showMessage('info', content, options);
  }, [showMessage]);

  /**
   * キューからメッセージを取得（キューが有効な場合）
   */
  const processMessageQueue = useCallback(() => {
    if (enableQueue && messageQueue.length > 0 && !message) {
      const nextMessage = messageQueue[0];
      setMessageQueue(prev => prev.slice(1));
      setMessage(nextMessage);

      if (nextMessage.autoClose) {
        timeoutRef.current = window.setTimeout(() => {
          setMessage(null);
        }, nextMessage.duration || autoCloseDuration);
      }
    }
  }, [enableQueue, messageQueue, message, autoCloseDuration]);

  /**
   * メッセージの自動処理
   */
  useEffect(() => {
    processMessageQueue();
  }, [processMessageQueue]);

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
  const hasQueuedMessages = messageQueue.length > 0;
  const totalMessages = (hasMessage ? 1 : 0) + messageQueue.length;

  /**
   * メッセージタイプに応じたアイコンを取得
   */
  const getMessageIcon = useCallback((messageType: MessageType): string => {
    const icons: Record<MessageType, string> = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[messageType] || 'ℹ️';
  }, []);

  /**
   * メッセージタイプに応じたCSSクラスを取得
   */
  const getMessageClass = useCallback((messageType: MessageType): string => {
    const classes: Record<MessageType, string> = {
      success: 'alert-success',
      error: 'alert-danger',
      warning: 'alert-warning',
      info: 'alert-info'
    };
    return classes[messageType] || 'alert-info';
  }, []);

  return {
    // 現在のメッセージ
    message,
    hasMessage,
    
    // キュー関連
    messageQueue: enableQueue ? messageQueue : [],
    hasQueuedMessages: enableQueue ? hasQueuedMessages : false,
    totalMessages: enableQueue ? totalMessages : (hasMessage ? 1 : 0),
    
    // メッセージ操作
    showMessage,
    clearMessage,
    clearAllMessages,
    
    // 便利メソッド
    showSuccess,
    showError,
    showWarning,
    showInfo,
    
    // ユーティリティ
    getMessageIcon,
    getMessageClass
  };
};
