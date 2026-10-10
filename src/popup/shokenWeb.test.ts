import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openShokenWebPage } from './shokenWeb';

describe('openShokenWebPage', () => {
  const mockChromeTabsCreate = vi.fn();
  const originalChrome = globalThis.chrome;

  beforeEach(() => {
    globalThis.chrome = {
      tabs: {
        create: mockChromeTabsCreate,
      },
    } as unknown as typeof chrome;

    mockChromeTabsCreate.mockReset();
  });

  afterEach(() => {
    globalThis.chrome = originalChrome;
  });

  it('chrome.tabs.createを正しいURLで呼び出すこと', async () => {
    mockChromeTabsCreate.mockResolvedValue({ id: 1 });

    await openShokenWebPage();

    expect(mockChromeTabsCreate).toHaveBeenCalledTimes(1);
    expect(mockChromeTabsCreate).toHaveBeenCalledWith({
      url: 'https://shoken-webapp.pages.dev'
    });
  });

  it('Chrome APIが利用できない場合にエラーをスローすること', async () => {
    globalThis.chrome = {} as unknown as typeof chrome;

    await expect(openShokenWebPage())
      .rejects
      .toThrow('Chrome拡張機能のAPIが利用できません');
  });

  it('chrome.tabs.createが失敗した場合にエラーをスローすること', async () => {
    const testError = new Error('タブの作成に失敗しました');
    mockChromeTabsCreate.mockRejectedValue(testError);

    await expect(openShokenWebPage())
      .rejects
      .toThrow(testError);

    expect(mockChromeTabsCreate).toHaveBeenCalledTimes(1);
  });

  it('console.errorがChrome APIエラー時に呼ばれること', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.chrome = {} as unknown as typeof chrome;

    try {
      await openShokenWebPage();
    } catch {
      // エラーは予期されている
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '証券Webページを開けませんでした:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('console.errorがタブ作成エラー時に呼ばれること', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('タブの作成に失敗しました');
    mockChromeTabsCreate.mockRejectedValue(testError);

    try {
      await openShokenWebPage();
    } catch {
      // エラーは予期されている
    }

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '証券Webページを開けませんでした:',
      testError
    );

    consoleErrorSpy.mockRestore();
  });
});
