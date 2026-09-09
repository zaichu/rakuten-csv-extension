import { IconLabel } from './ui';
import type { DownloadOption } from './downloadOptions';
import type { CsvDownloadType } from '../types';

/**
 * カテゴリ別オプション表示の props
 * 選択状態の判定ロジックは親が持ち、このコンポーネントは受け取った props を描画するだけ
 */
export interface CategorySectionProps {
  readonly category: string;
  readonly options: readonly DownloadOption[];
  readonly categoryLabel: string;
  readonly categoryIcon: string;
  readonly selectedInCategory: number;
  readonly allInCategorySelected: boolean;
  readonly selectedOptions: ReadonlySet<CsvDownloadType>;
  readonly isDownloading: boolean;
  readonly onOptionChange: (optionId: CsvDownloadType) => void;
  readonly onCategoryToggle: (category: string) => void;
}

/**
 * カテゴリ別オプションの表示コンポーネント（見た目のみ）
 */
export const CategorySection = ({
  category,
  options,
  categoryLabel,
  categoryIcon,
  selectedInCategory,
  allInCategorySelected,
  selectedOptions,
  isDownloading,
  onOptionChange,
  onCategoryToggle,
}: CategorySectionProps) => {
  return (
    <div className="category-section" data-category={category}>
      <div className="category-header">
        <div className="category-title">
          <span>{categoryIcon}</span>
          <span>{categoryLabel}</span>
          <span className="category-count">{selectedInCategory}/{options.length}</span>
        </div>
        <button
          type="button"
          className={allInCategorySelected ? 'tog-off' : 'tog-on'}
          onClick={() => onCategoryToggle(category)}
          disabled={isDownloading}
        >
          {allInCategorySelected ? '全解除' : '全選択'}
        </button>
      </div>

      <div className="category-body">
        {options.map((option) => (
          <div key={option.id} className={`option-row${selectedOptions.has(option.id) ? ' option-row-selected' : ''}`}>
            <input
              type="checkbox"
              id={option.id}
              checked={selectedOptions.has(option.id)}
              onChange={() => onOptionChange(option.id)}
              disabled={isDownloading}
            />
            <label htmlFor={option.id}>
              <IconLabel icon={option.icon} label={option.label} />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};
