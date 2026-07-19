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
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
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

test('loads the extension, persists quick capture, and keeps core surfaces accessible', async ({ extensionContext, extensionId }, testInfo) => {
  const popup = await extensionContext.newPage();
  await popup.setViewportSize({ width: 360, height: 560 });
  await popup.emulateMedia({ reducedMotion: 'reduce' });
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
  const sidePanelErrors: string[] = [];
  sidePanel.on('console', (message) => {
    if (message.type() === 'error') sidePanelErrors.push(message.text());
  });
  sidePanel.on('pageerror', (error) => sidePanelErrors.push(error.message));
  await sidePanel.setViewportSize({ width: 400, height: 700 });
  await sidePanel.emulateMedia({ reducedMotion: 'reduce' });
  await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(sidePanel.getByRole('button', { name: 'Notes' })).toBeVisible();

  await sidePanel.getByRole('button', { name: 'Tasks' }).click();
  await sidePanel.getByRole('button', { name: 'Cài đặt' }).click();
  const preferencesDialog = sidePanel.getByRole('dialog', { name: 'Cài đặt MochiNote' });
  await expect(preferencesDialog).toBeVisible();
  await preferencesDialog.getByRole('button', { name: 'Tối', exact: true }).click();
  await preferencesDialog.getByRole('button', { name: 'Danh sách', exact: true }).click();
  await expect(sidePanel.locator('.side-panel-app')).toHaveAttribute('data-theme', 'dark');
  await expect(sidePanel.locator('.side-panel-app')).toHaveAttribute('data-layout', 'list');
  await preferencesDialog.getByRole('button', { name: 'Sao lưu & phục hồi' }).click();
  const portabilityDialog = sidePanel.getByRole('dialog', { name: 'Sao lưu dữ liệu' });
  await expect(portabilityDialog).toBeVisible();
  await portabilityDialog.getByRole('button', { name: 'Tải file JSON' }).click();
  await expect(sidePanel.getByRole('status')).toContainText('Đã tạo bản sao lưu');
  await portabilityDialog.getByRole('button', { name: 'Đóng cài đặt dữ liệu' }).click();
  await preferencesDialog.getByRole('button', { name: 'Đóng cài đặt' }).click();

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

  await sidePanel.getByRole('button', { name: 'Thêm ghi chú' }).click();
  await sidePanel.getByRole('textbox', { name: 'Tiêu đề ghi chú' }).fill('E2E audio note');
  await sidePanel.getByRole('textbox', { name: 'Nội dung ghi chú' }).fill('Audio lifecycle regression');
  await sidePanel.getByRole('textbox', { name: 'Thêm thẻ' }).fill('release');
  await sidePanel.getByRole('textbox', { name: 'Thêm thẻ' }).press('Enter');
  await expect(sidePanel.getByText('#release')).toBeVisible();
  await sidePanel.setViewportSize({ width: 320, height: 700 });
  await expect(sidePanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.setViewportSize({ width: 400, height: 700 });
  await sidePanel.getByRole('button', { name: 'Bắt đầu ghi âm' }).click();
  await expect(sidePanel.getByRole('button', { name: /Dừng ghi/ })).toBeVisible();
  await sidePanel.getByRole('button', { name: /Dừng ghi/ }).click();
  await expect(sidePanel.getByRole('button', { name: 'Xóa bản ghi âm' })).toBeVisible();
  await sidePanel.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(sidePanel.locator('audio')).toBeVisible();
  await expect(sidePanel.getByLabel('Thẻ ghi chú')).toContainText('#release');
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.getByRole('button', { name: 'Xóa', exact: true }).click();
  await sidePanel.getByRole('button', { name: 'Chuyển vào thùng rác' }).click();
  await expect(sidePanel.getByRole('status')).toContainText('thùng rác');
  await sidePanel.getByRole('button', { name: 'Hoàn tác' }).click();
  await sidePanel.getByRole('button', { name: /E2E audio note/ }).click();
  await expect(sidePanel.locator('audio')).toBeVisible();
  await sidePanel.getByRole('button', { name: 'Xóa bản ghi âm' }).click();
  await expect(sidePanel.getByRole('status')).toContainText('Đã xóa bản ghi âm');
  await sidePanel.getByRole('button', { name: 'Quay lại danh sách ghi chú' }).click();
  await sidePanel.getByRole('button', { name: 'Tìm kiếm ghi chú', exact: true }).click();
  await sidePanel.getByLabel('Lọc theo thẻ').selectOption('release');
  await sidePanel.getByRole('button', { name: 'Xem kết quả' }).click();
  await expect(sidePanel.getByText('E2E audio note')).toBeVisible();
  await expect(sidePanel.getByText('E2E capture note')).toBeHidden();
  await sidePanel.setViewportSize({ width: 320, height: 700 });
  await expect(sidePanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(sidePanel);
  await testInfo.attach('note-tags-filter-320px', {
    body: await sidePanel.screenshot(),
    contentType: 'image/png',
  });
  expect(sidePanelErrors).toEqual([]);
});
