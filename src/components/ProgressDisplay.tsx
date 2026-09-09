/**
 * 進捗表示の props
 * このコンポーネントは受け取った props を描画するだけ
 */
export interface ProgressDisplayProps {
  readonly isDownloading: boolean;
  readonly currentOperation?: string;
  readonly progress?: number;
  readonly onCancel: () => void;
}

/**
 * 進捗表示コンポーネント（見た目のみ）
 */
export const ProgressDisplay = ({
  isDownloading,
  currentOperation,
  progress,
  onCancel,
}: ProgressDisplayProps) => {
  if (!isDownloading) return null;

  return (
    <div className="progress-notice">
      <div className="progress-row">
        <div className="progress-label">
          <span className="spinner-xs" role="status"><span className="sr-only">読み込み中...</span></span>
          <span>{currentOperation || 'ダウンロード中...'}</span>
        </div>
        <button
          type="button"
          className="tog-off"
          onClick={onCancel}
        >
          キャンセル
        </button>
      </div>
      {progress !== undefined && (
        <div className="progress-track">
          <div
            className="progress-fill"
            role="progressbar"
            style={{ width: `${progress}%` }}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
};
