import React from 'react';
import type { MessageProps } from '../../types';
import { IconLabel } from './IconLabel';

/**
 * アプリケーションメッセージコンポーネント
 */
export const Message = ({ 
  type, 
  content, 
  onClose,
  autoClose = false,
  duration = 5000 
}: MessageProps) => {
  // アイコンマッピング
  const iconMap = {
    success: '✅',
    error: '⚠️',
    warning: '⚠️',
    info: 'ℹ️'
  };

  // クラス名マッピング
  const classMap = {
    success: 'msg-success',
    error: 'msg-error',
    warning: 'msg-warning',
    info: 'msg-info'
  };

  const getLabel = (messageType: MessageProps['type']): string => {
    const labelMap = {
      success: '成功',
      error: 'エラー',
      warning: '警告',
      info: '情報'
    };
    return labelMap[messageType];
  };

  // 自動クローズの実装
  React.useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose, duration]);

  return (
    <div className={classMap[type]} role="alert">
      <div className="msg-inner">
        <div className="flex-1">
          <IconLabel icon={iconMap[type]} label={getLabel(type)} />
          <div className="mt-1">{content}</div>
        </div>
        {onClose && (
          <button
            type="button"
            className="msg-close"
            aria-label="Close"
            onClick={onClose}
          >×</button>
        )}
      </div>
    </div>
  );
};
