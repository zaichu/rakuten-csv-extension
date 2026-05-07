import type { HeaderProps } from '../../types';

/**
 * アプリケーションヘッダーコンポーネント
 */
export const Header = ({
  title,
  icon = '📈',
  className = 'text-lg font-bold bg-red-600 text-white text-center p-1'
}: HeaderProps) => (
  <header className={className} style={{ fontSize: '0.9rem' }}>
    {icon && <span className="icon mr-2">{icon}</span>}
    {title}
  </header>
);
