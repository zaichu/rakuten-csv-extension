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
    success: 'bg-green-50 text-green-800 border border-green-200',
    error: 'bg-red-50 text-red-800 border border-red-200',
    warning: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
    info: 'bg-blue-50 text-blue-800 border border-blue-200'
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
      className={`rounded p-2 text-sm ${classMap[type]}`}
      role="alert"
    >
      <div className="flex justify-between items-center">
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
            className="ml-2 text-lg leading-none opacity-70 hover:opacity-100"
            aria-label="Close"
            onClick={onClose}
          >×</button>
        )}
      </div>
    </div>
  );
};
