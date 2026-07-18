import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  reporter: 'line',
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: 'chrome-extension://mochinote-test',
    trace: 'retain-on-failure',
  },
  workers: 1,
});
