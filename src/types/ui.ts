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
 * メッセージコンポーネントのプロパティ
 */
export interface MessageProps {
  type: MessageType;
  content: string;
  onClose?: () => void;
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
