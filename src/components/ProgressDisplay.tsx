/**
 * 進捗表示の props
 * このコンポーネントは受け取った props を描画するだけ
 */
export interface ProgressDisplayProps {
  readonly isDownloading: boolean;
  readonly currentOperation?: string;
}

/**
 * 進捗表示コンポーネント（見た目のみ）
 */
export const ProgressDisplay = ({
  isDownloading,
  currentOperation,
}: ProgressDisplayProps) => {
  if (!isDownloading) return null;

  return (
    <div className="progress-notice">
      <div className="progress-label">
        <span className="spinner-xs" role="status"><span className="sr-only">読み込み中...</span></span>
        <span>{currentOperation || 'ダウンロード中...'}</span>
      </div>
    </div>
  );
};
