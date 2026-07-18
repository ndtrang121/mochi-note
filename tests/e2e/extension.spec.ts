import { AxeBuilder } from '@axe-core/playwright';
import { expect, test as baseTest, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const test = baseTest.extend<{ extensionContext: BrowserContext; extensionId: string }>({
  extensionContext: [async ({ browserName: _browserName }, provide) => {
    void _browserName;
    const userDataDir = await mkdtemp(join(tmpdir(), 'mochinote-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      args: [
        `--disable-extensions-except=${join(process.cwd(), '.output', 'chrome-mv3')}`,
        `--load-extension=${join(process.cwd(), '.output', 'chrome-mv3')}`,
      ],
      headless: false,
    });
    try {
      await provide(context);
    } finally {
      await context.close();
      await rm(userDataDir, { force: true, recursive: true });
    }
  }, { scope: 'test' }],
  extensionId: [async ({ extensionContext }, use) => {
    const serviceWorker = extensionContext.serviceWorkers()[0] ?? await extensionContext.waitForEvent('serviceworker', { timeout: 10_000 });
    await use(new URL(serviceWorker.url()).host);
  }, { scope: 'test' }],
});

async function assertNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, results.violations.map((violation) => violation.id).join(', ')).toEqual([]);
}

test('loads the extension, persists quick capture, and keeps core surfaces accessible', async ({ extensionContext, extensionId }) => {
  const popup = await extensionContext.newPage();
  await popup.setViewportSize({ width: 360, height: 560 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup).toHaveTitle('MochiNote nhanh');
  await expect(popup.getByRole('button', { name: 'Chụp trang' })).toBeVisible();
  await popup.getByRole('button', { name: 'Ghi chú nhanh' }).click();
  await popup.getByRole('textbox', { name: 'Ghi chú nhanh' }).fill('E2E capture note');
  await popup.getByRole('button', { name: 'Lưu' }).click();
  await expect(popup.getByRole('heading', { level: 2, name: 'E2E capture note' })).toBeVisible();
  await popup.getByRole('button', { name: 'Chụp trang' }).click();
  await expect(popup.getByRole('status')).toHaveText('Không thể đọc trang hiện tại.');
  await expect(popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(popup);

  const sidePanel = await extensionContext.newPage();
  await sidePanel.setViewportSize({ width: 400, height: 700 });
  await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(sidePanel.getByRole('button', { name: 'Notes' })).toBeVisible();
  await sidePanel.getByRole('button', { name: 'Notes' }).click();
  await expect(sidePanel.getByText('E2E capture note')).toBeVisible();
  await expect(sidePanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(sidePanel);

  for (const tabName of ['Tasks', 'Folders', 'Sticky']) {
    await sidePanel.getByRole('button', { name: tabName }).click();
    await expect(sidePanel.getByRole('main')).toBeVisible();
    await assertNoAccessibilityViolations(sidePanel);
  }

  await sidePanel.getByRole('button', { name: 'Notes' }).click();
  await sidePanel.getByRole('button', { name: 'Tìm kiếm ghi chú', exact: true }).click();
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.getByRole('button', { name: 'Đóng tìm kiếm' }).click();
});
