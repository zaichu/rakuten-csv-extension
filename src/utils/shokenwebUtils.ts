import { ShokenWebUrlConfig } from '../types/shokenweb';

export class ShokenWebUtils {
    private static readonly URL_CONFIG: ShokenWebUrlConfig = {
        baseUrl: 'https://zaichu.github.io/shoken-webapp/'
    };

    /**
     * 証券WebのURL設定
     */
    private static readonly DOMAIN_PATTERN = 'zaichu.github.io/shoken-webapp/';

    /**
     * 証券Webのサイトかどうかを判定
     */
    static isShokenWeb(url: string): boolean {
        try {
            return url.includes(this.DOMAIN_PATTERN);
        } catch (error) {
            console.warn('URL判定エラー:', error);
            return false;
        }
    }

    /**
     * 証券Webのトップページを開く
     */
    static openShokenWebPage(): void {
        try {
            chrome.tabs.create({
                url: this.URL_CONFIG.baseUrl
            });
        } catch (error) {
            console.error('証券Webページを開けませんでした:', error);
            // フォールバック：直接ブラウザで開く
            window.open(this.URL_CONFIG.baseUrl, '_blank');
        }
    }
}