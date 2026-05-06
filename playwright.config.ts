import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:5173',
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs --port 5173',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
