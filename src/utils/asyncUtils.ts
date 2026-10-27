export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * 待ち受けの定型処理（settled旗 + 上限タイマー）をまとめる
 *
 * リスナー登録→先に届いた通知を拾う順序は呼び出し側で保つこと。
 * 上限時間の定数（300/3000/5000ms等）は呼び出し側のまま変えない。
 */
export function createOneShotWait(
  timeoutMs: number,
  onTimeout: () => void
): {
  readonly finish: (done: () => void) => void;
  readonly cancel: () => void;
} {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    onTimeout();
  }, timeoutMs);

  return {
    finish: (done: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      done();
    },
    cancel: () => {
      clearTimeout(timer);
    }
  };
}
