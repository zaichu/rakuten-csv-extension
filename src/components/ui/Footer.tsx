import type { FooterProps } from '../../types';

/**
 * アプリケーションフッターコンポーネント
 */
export const Footer = ({ 
  version, 
  className = 'block bg-gray-500 text-white text-center w-full text-xs px-2 py-0.5'
}: FooterProps) => (
  <footer>
    <div className={className}>
      楽天証券CSV拡張機能 v{version}
    </div>
  </footer>
);
