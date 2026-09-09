/**
 * 選択状況表示の props
 * 選択状態の判定ロジックは親が持ち、このコンポーネントは受け取った props を描画するだけ
 */
export interface SelectionSummaryProps {
  readonly selectedCount: number;
  readonly totalCount: number;
  readonly allSelected: boolean;
  readonly isDownloading: boolean;
  readonly onSelectAll: () => void;
}

/**
 * 選択状況の表示コンポーネント（見た目のみ）
 */
export const SelectionSummary = ({
  selectedCount,
  totalCount,
  allSelected,
  isDownloading,
  onSelectAll,
}: SelectionSummaryProps) => {
  return (
    <div className="selection-summary">
      <div className="selection-info">
        <span>選択中 <strong className="text-blue-700 font-bold">{selectedCount}</strong> / {totalCount}</span>
      </div>
      <button
        type="button"
        className={allSelected ? 'tog-all-off' : 'tog-all-on'}
        onClick={onSelectAll}
        disabled={isDownloading}
      >
        {allSelected ? '全解除' : '全選択'}
      </button>
    </div>
  );
};
