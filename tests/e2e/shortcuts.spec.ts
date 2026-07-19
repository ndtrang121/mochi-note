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

    await page.keyboard.press('Control+/');
    await expect(page.getByRole('dialog', { name: 'Phím tắt MochiNote' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Phím tắt MochiNote' })).toBeHidden();

    await page.keyboard.press('Control+n');
    await expect(page.locator('#note-editor-heading')).toBeVisible();
  } finally {
    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});
