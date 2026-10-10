const SHOKEN_WEB_URL = 'https://shoken-webapp.pages.dev';

/**
 * 証券Webのトップページを新しいタブで開く
 * @throws {Error} Chrome拡張機能のAPIが利用できない場合
 */
export async function openShokenWebPage(): Promise<void> {
  if (!chrome?.tabs?.create) {
    const error = new Error('Chrome拡張機能のAPIが利用できません');
    console.error('証券Webページを開けませんでした:', error);
    throw error;
  }

  try {
    await chrome.tabs.create({ url: SHOKEN_WEB_URL });
  } catch (error) {
    console.error('証券Webページを開けませんでした:', error);
    throw error;
  }
}
