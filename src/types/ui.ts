/**
 * UI コンポーネントの共通型定義
 */

import type { MessageType } from './extension';

/**
 * アイコンラベルコンポーネントのプロパティ
 */
export interface IconLabelProps {
  icon: string;
  label: string;
  containerClassName?: string;
  iconClassName?: string;
}

/**
 * ボタンコンポーネントのプロパティ
 */
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * メッセージコンポーネントのプロパティ
 */
export interface MessageProps {
  type: MessageType;
  content: string;
  onClose?: () => void;
  autoClose?: boolean;
  duration?: number;
}

/**
 * ヘッダーコンポーネントのプロパティ
 */
export interface HeaderProps {
  title: string;
  icon?: string;
  className?: string;
}

/**
 * フッターコンポーネントのプロパティ
 */
export interface FooterProps {
  version: string;
  className?: string;
}
