import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sleep, withTimeout, createOneShotWait, waitForTabComplete } from './asyncUtils';

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('指定ミリ秒経過後に解決する', async () => {
    const promise = sleep(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('元の Promise が先に解決された場合、その値を返す', async () => {
    const promise = Promise.resolve(42);
    const result = await withTimeout(promise, 1000, 'タイムアウト');
    expect(result).toBe(42);
  });

  it('タイムアウト前に解決された Promise の値を返す', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('done'), 100);
    });

    const resultPromise = withTimeout(promise, 1000, 'タイムアウト');
    vi.advanceTimersByTime(100);

    const result = await resultPromise;
    expect(result).toBe('done');
  });

  it('指定時間内に解決されない場合、timeoutMessage でリジェクトする', async () => {
    const neverResolves = new Promise<never>(() => {});
    const resultPromise = withTimeout(neverResolves, 500, 'ステップがタイムアウトしました');

    vi.advanceTimersByTime(500);

    await expect(resultPromise).rejects.toThrow('ステップがタイムアウトしました');
  });

  it('元の Promise が reject した場合、そのエラーを伝播する', async () => {
    const failing = Promise.reject(new Error('元のエラー'));
    await expect(withTimeout(failing, 1000, 'タイムアウト')).rejects.toThrow('元のエラー');
  });
});

describe('createOneShotWait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('finishを呼ぶと上限時間の前に打ち切れる', async () => {
    const onTimeout = vi.fn();
    const wait = createOneShotWait(1000, onTimeout);
    let done = false;
    wait.finish(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('何も起きなければ上限時間で打ち切る', async () => {
    const onTimeout = vi.fn();
    createOneShotWait(1000, onTimeout);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('二重に完了させても一度だけ実行する', async () => {
    const onTimeout = vi.fn();
    const wait = createOneShotWait(1000, onTimeout);
    const done = vi.fn();
    wait.finish(done);
    wait.finish(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe('waitForTabComplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function currentListener(): (tabId: number, info: chrome.tabs.OnUpdatedInfo) => void {
    const calls = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls;
    return calls[calls.length - 1][0] as (tabId: number, info: chrome.tabs.OnUpdatedInfo) => void;
  }

  it('対象タブの読み込み完了で解決する', async () => {
    const pending = waitForTabComplete(42, 1000);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    currentListener()(42, { status: 'complete' } as chrome.tabs.OnUpdatedInfo);
    await pending;
    expect(settled).toBe(true);
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(1);
  });

  it('別タブや未完了の通知では解決しない', async () => {
    const pending = waitForTabComplete(42, 1000);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    const listener = currentListener();
    listener(99, { status: 'complete' } as chrome.tabs.OnUpdatedInfo);
    listener(42, { status: 'loading' } as chrome.tabs.OnUpdatedInfo);
    await vi.advanceTimersByTimeAsync(500);
    expect(settled).toBe(false);
    listener(42, { status: 'complete' } as chrome.tabs.OnUpdatedInfo);
    await pending;
    expect(settled).toBe(true);
  });

  it('上限超過で解決する', async () => {
    const pending = waitForTabComplete(42, 1000);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(settled).toBe(true);
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(1);
  });

  it('上限超過で渡された理由で拒否する', async () => {
    const reason = new Error('タブの再読み込みがタイムアウトしました');
    const pending = waitForTabComplete(42, 1000, reason);
    const assertion = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(1);
  });

  it('解決後は上限超過しても何もしない', async () => {
    const reason = new Error('タブの再読み込みがタイムアウトしました');
    const pending = waitForTabComplete(42, 1000, reason);
    currentListener()(42, { status: 'complete' } as chrome.tabs.OnUpdatedInfo);
    await pending;
    await vi.advanceTimersByTimeAsync(1000);
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledTimes(1);
  });
});
