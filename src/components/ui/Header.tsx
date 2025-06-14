import type { HeaderProps } from '../../types';

/**
 * アプリケーションヘッダーコンポーネント
 */
export const Header = ({
  title,
  icon = '📈',
  className = 'h4 bg-danger bg-gradient text-white text-center p-1'
}: HeaderProps) => (
  <header className={className} style={{ fontSize: '0.9rem' }}>
    {icon && <span className="icon me-2">{icon}</span>}
    {title}
  </header>
);
