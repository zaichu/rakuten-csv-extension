import type { HeaderProps } from '../../types';

/**
 * アプリケーションヘッダーコンポーネント
 */
export const Header = ({
  title,
  icon = '📈',
  className = 'popup-header'
}: HeaderProps) => (
  <header className={className}>
    {icon && <span className="mr-1">{icon}</span>}
    {title}
  </header>
);
