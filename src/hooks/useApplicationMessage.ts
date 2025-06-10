import { useState, useCallback } from 'react';
import type { ApplicationMessage } from '../types';

/**
 * アプリケーションメッセージ管理フック
 */
export const useApplicationMessage = () => {
  const [message, setMessage] = useState<ApplicationMessage | null>(null);

  const showMessage = useCallback((
    type: ApplicationMessage['type'], 
    content: string
  ) => {
    setMessage({
      type,
      content,
      timestamp: new Date()
    });
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, []);

  const showSuccess = useCallback((content: string) => {
    showMessage('success', content);
  }, [showMessage]);

  const showError = useCallback((content: string) => {
    showMessage('error', content);
  }, [showMessage]);

  const showWarning = useCallback((content: string) => {
    showMessage('warning', content);
  }, [showMessage]);

  const showInfo = useCallback((content: string) => {
    showMessage('info', content);
  }, [showMessage]);

  return {
    message,
    showMessage,
    clearMessage,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};
