import type { IconLabelProps } from '../../types';

/**
 * アイコンとラベルを表示するコンポーネント
 */
export const IconLabel = ({
  icon,
  label,
  containerClassName = 'icon-label',
  iconClassName = 'icon'
}: IconLabelProps) => (
  <div className={containerClassName}>
    <span className={iconClassName}>{icon}</span>
    {label}
  </div>
);
