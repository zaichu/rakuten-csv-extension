import { test, expect } from '@playwright/test';

test('投資信託の保有残高がポートフォリオに表示され選択できる', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['chrome'] = {
      runtime: { sendMessage: () => Promise.resolve() },
      tabs: { query: () => Promise.resolve([]) },
    };
  });

  await page.goto('/src/popup/index.html');

  const portfolio = page.locator('[data-category="portfolio"]');
  const option = portfolio.getByRole('checkbox', { name: /投資信託/ });
  await expect(option).toBeVisible();

  await option.check();
  await expect(page.getByRole('button', { name: /CSV ダウンロード \(1件\)/ })).toBeEnabled();
});
