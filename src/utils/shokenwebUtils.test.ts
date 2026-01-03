import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShokenWebUtils } from './shokenwebUtils';

describe('ShokenWebUtils', () => {
    // Chrome APIのモック
    const mockChromeTabsCreate = vi.fn();
    const originalChrome = globalThis.chrome;

    beforeEach(() => {
        // Chrome APIのモックをセットアップ
        globalThis.chrome = {
            tabs: {
                create: mockChromeTabsCreate,
            },
        } as unknown as typeof chrome;

        // モックをリセット
        mockChromeTabsCreate.mockReset();
    });

    afterEach(() => {
        // グローバルのchromeを元に戻す
        globalThis.chrome = originalChrome;
    });

    describe('openShokenWebPage', () => {
        it('chrome.tabs.createを正しいURLで呼び出すこと', async () => {
            mockChromeTabsCreate.mockResolvedValue({ id: 1 });

            await ShokenWebUtils.openShokenWebPage();

            expect(mockChromeTabsCreate).toHaveBeenCalledTimes(1);
            expect(mockChromeTabsCreate).toHaveBeenCalledWith({
                url: 'https://shoken-webapp.vercel.app'
            });
        });

        it('Chrome APIが利用できない場合にエラーをスローすること', async () => {
            // chrome.tabs.createを削除
            globalThis.chrome = {} as unknown as typeof chrome;

            await expect(ShokenWebUtils.openShokenWebPage())
                .rejects
                .toThrow('Chrome拡張機能のAPIが利用できません');
        });

        it('chrome.tabs.createが失敗した場合にエラーをスローすること', async () => {
            const testError = new Error('タブの作成に失敗しました');
            mockChromeTabsCreate.mockRejectedValue(testError);

            await expect(ShokenWebUtils.openShokenWebPage())
                .rejects
                .toThrow(testError);

            expect(mockChromeTabsCreate).toHaveBeenCalledTimes(1);
        });

        it('console.errorがChrome APIエラー時に呼ばれること', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            globalThis.chrome = {} as unknown as typeof chrome;

            try {
                await ShokenWebUtils.openShokenWebPage();
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
                await ShokenWebUtils.openShokenWebPage();
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

    describe('getBaseUrl', () => {
        it('正しいベースURLを返すこと', () => {
            const baseUrl = ShokenWebUtils.getBaseUrl();

            expect(baseUrl).toBe('https://shoken-webapp.vercel.app');
        });

        it('返されるURLが文字列型であること', () => {
            const baseUrl = ShokenWebUtils.getBaseUrl();

            expect(typeof baseUrl).toBe('string');
        });
    });
});
