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
    success: 'alert-success-custom',
    error: 'alert-danger-custom',
    warning: 'alert-warning-custom',
    info: 'alert-info-custom'
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
    <div
      className={`alert alert-custom ${classMap[type]}`}
      role="alert"
    >
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <IconLabel 
            icon={iconMap[type]} 
            label={getLabel(type)} 
          />
          <div className="mt-1">{content}</div>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={onClose}
          />
        )}
      </div>
    </div>
  );
};
