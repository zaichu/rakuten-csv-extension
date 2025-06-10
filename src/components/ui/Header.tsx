import type { HeaderProps } from '../../types';

/**
 * アプリケーションヘッダーコンポーネント
 */
export const Header = ({ 
  title, 
  icon = '📈', 
  className = 'h3 bg-danger bg-gradient text-white text-center p-2' 
}: HeaderProps) => (
  <header className={className}>
    {icon && <span className="icon me-2">{icon}</span>}
    {title}
  </header>
);
