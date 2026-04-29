import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from './asyncUtils';

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
