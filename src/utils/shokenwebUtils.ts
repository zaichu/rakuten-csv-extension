import { ShokenWebUrlConfig } from '../types/shokenweb';

export class ShokenWebUtils {
    private static readonly URL_CONFIG: ShokenWebUrlConfig = {
        baseUrl: 'https://shoken-webapp.vercel.app'
    };

    /**
     * 証券Webのトップページを新しいタブで開く
     * @throws {Error} Chrome拡張機能のAPIが利用できない場合
     * @returns {Promise<void>} タブの作成が完了したときに解決されるPromise
     */
    static async openShokenWebPage(): Promise<void> {
        if (!chrome?.tabs?.create) {
            const error = new Error('Chrome拡張機能のAPIが利用できません');
            console.error('証券Webページを開けませんでした:', error);
            throw error;
        }

        try {
            await chrome.tabs.create({
                url: this.URL_CONFIG.baseUrl
            });
        } catch (error) {
            console.error('証券Webページを開けませんでした:', error);
            throw error;
        }
    }

    /**
     * 証券WebのベースURLを取得
     * @returns {string} ベースURL
     */
    static getBaseUrl(): string {
        return this.URL_CONFIG.baseUrl;
    }
}