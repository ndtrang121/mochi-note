import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

test('supports keyboard navigation and shortcut help in the side panel', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'mochinote-shortcuts-'));
  const extensionPath = join(process.cwd(), '.output', 'chrome-mv3');
  const context = await chromium.launchPersistentContext(userDataDir, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false,
  });
  try {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    const manifest = await page.evaluate(async () => {
      const response = await fetch('manifest.json');
      return response.json() as Promise<{ commands?: Record<string, { description: string; suggested_key?: { default?: string } }> }>;
    });
    expect(manifest.commands?.['open-quick-capture']?.suggested_key?.default).toBe('Ctrl+Shift+M');

    await page.keyboard.press('Control+/');
    await expect(page.getByRole('dialog', { name: 'Phím tắt MochiNote' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Phím tắt MochiNote' })).toBeHidden();

    await page.keyboard.press('Control+n');
    await expect(page.locator('#note-editor-heading')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sticky' }).click();
    await page.keyboard.press('Control+k');
    await page.getByLabel('Lọc theo ngày tạo').selectOption('week');
    await expect(page.getByLabel('Lọc theo ngày tạo')).toHaveValue('week');
  } finally {
    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});
