import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * 画面(shoken-webapp)から拡張機能へ依頼してCSV本文が返ることを確認する。
 *
 * 楽天証券はモックの疑似ページ(http ではなく https://www.rakuten-sec.co.jp で配信)を
 * 使い、拡張機能に読み込んだ dist を使う。
 */

const distPath = resolve(process.cwd(), 'dist');
const homeHtml = readFileSync(join(process.cwd(), 'e2e/fixtures/rakuten-mock/home.html'), 'utf8');
const possessHtml = readFileSync(
  join(process.cwd(), 'e2e/fixtures/rakuten-mock/possess.html'),
  'utf8'
);

const EXPECTED_CSV = '銘柄コード,数量,取得単価\n1234,10,2500.5\n';

// 拡張機能を読み込んだブラウザの起動に時間がかかるため余裕を持たせる
test.setTimeout(60_000);

type AppMessage = {
  type: string;
  state?: string;
  kind?: string;
  reason?: string;
  csvs?: { kind: string; content: string; fetchedAt: string }[];
  failures?: { kind: string; reason: string }[];
  error?: string;
};

async function launchExtension(): Promise<{ context: BrowserContext; extensionId: string }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'rakuten-csv-extension-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  return { context, extensionId: new URL(serviceWorker.url()).host };
}

async function openRakutenMock(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.route('https://www.rakuten-sec.co.jp/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/web/jp/stock/possess/list.html')) {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: possessHtml });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: homeHtml });
  });
  await page.goto('https://www.rakuten-sec.co.jp/');
  return page;
}

async function requestFromApp(page: Page, extensionId: string, kinds: string[]): Promise<void> {
  await page.goto('http://localhost:4173/');
  await page.evaluate(
    ({ id, requestedKinds }) => {
      const messages: AppMessage[] = [];
      (window as unknown as { __messages: AppMessage[] }).__messages = messages;

      const port = chrome.runtime.connect(id);
      port.onMessage.addListener((message: AppMessage) => {
        messages.push(message);
      });
      port.postMessage({ type: 'fetchLatestCsv', kinds: requestedKinds });
    },
    { id: extensionId, requestedKinds: kinds }
  );
}

test('画面から依頼するとCSV本文と取得時刻が返る', async () => {
  const { context, extensionId } = await launchExtension();
  try {
    await openRakutenMock(context);

    const appPage = await context.newPage();
    await appPage.route('http://localhost:4173/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<html></html>' });
    });
    await requestFromApp(appPage, extensionId, ['assetbalance']);

    await appPage.waitForFunction(
      () => {
        const messages = (window as unknown as { __messages?: AppMessage[] }).__messages ?? [];
        return messages.some((message) => message.type === 'result');
      },
      undefined,
      { timeout: 30_000 }
    );

    const messages = await appPage.evaluate(
      () => (window as unknown as { __messages: AppMessage[] }).__messages
    );

    const result = messages.find((message) => message.type === 'result');
    expect(result?.failures).toEqual([]);
    expect(result?.csvs?.[0].kind).toBe('assetbalance');
    expect(result?.csvs?.[0].content).toBe(EXPECTED_CSV);
    expect(result?.csvs?.[0].fetchedAt).toBeTruthy();

    expect(messages.filter((message) => message.type === 'progress')).toEqual([
      { type: 'progress', state: 'fetching', kind: 'assetbalance' },
      { type: 'progress', state: 'completed', kind: 'assetbalance' },
    ]);
  } finally {
    await context.close();
  }
});

test('許可されていないオリジンからは依頼を受け付けない', async () => {
  const { context, extensionId } = await launchExtension();
  try {
    const appPage = await context.newPage();
    await appPage.route('http://127.0.0.1:4173/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<html></html>' });
    });
    await appPage.goto('http://127.0.0.1:4173/');

    const connected = await appPage.evaluate((id) => {
      try {
        const port = chrome.runtime.connect(id);
        port.onMessage.addListener(() => {});
        port.postMessage({ type: 'fetchLatestCsv', kinds: ['assetbalance'] });
        return true;
      } catch {
        return false;
      }
    }, extensionId);

    // 接続できた場合も応答が返らないことを確認する
    await appPage.waitForTimeout(2_000);
    const messages = await appPage.evaluate(
      () => (window as unknown as { __messages?: AppMessage[] }).__messages ?? []
    );

    expect(messages.some((message) => message.type === 'result')).toBe(false);
    expect(connected).toBe(false);
  } finally {
    await context.close();
  }
});
