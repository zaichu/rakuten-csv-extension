import type { FooterProps } from '../../types';

/**
 * アプリケーションフッターコンポーネント
 */
export const Footer = ({ 
  version, 
  className = 'badge bg-secondary text-center w-100' 
}: FooterProps) => (
  <footer>
    <div className={className}>
      楽天証券CSV拡張機能 v{version}
    </div>
  </footer>
);
