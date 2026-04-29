import { test, expect } from '@playwright/test';

test('smoke: popup が表示される', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['chrome'] = {
      runtime: { sendMessage: () => Promise.resolve() },
      tabs: { query: () => Promise.resolve([]) },
    };
  });

  await page.goto('/src/popup/index.html');
  await expect(page.getByText('楽天証券 CSV取得ツール')).toBeVisible();
});
