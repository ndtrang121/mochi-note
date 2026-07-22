import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('keeps link editing stable and round-trips a downloaded backup', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'mochinote-editor-portability-'));
  const extensionPath = join(process.cwd(), '.output', 'chrome-mv3');
  const context = await chromium.launchPersistentContext(userDataDir, {
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    headless: false,
  });

  try {
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await page.getByRole('button', { name: 'Sticky' }).click();
    await page.getByRole('button', { name: 'Thêm ghi chú' }).click();
    await page.getByLabel('Tiêu đề ghi chú').fill('Link backup regression');
    const editor = page.getByRole('textbox', { name: 'Nội dung ghi chú' });
    await editor.fill('Open MochiNote docs');
    await editor.selectText();
    const editorUrl = page.url();
    await page.getByRole('button', { name: 'Thêm liên kết' }).click();
    await page.getByRole('textbox', { name: 'Liên kết' }).fill('example.com/mochinote');
    await page.getByRole('button', { name: 'Gắn' }).click();

    await expect(page).toHaveURL(editorUrl);
    await expect(page.getByRole('heading', { level: 1, name: 'Ghi chú mới' })).toBeVisible();
    await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/mochinote');
    await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
    await expect(page.locator('.note-detail-body a')).toHaveAttribute('href', 'https://example.com/mochinote');

    await page.getByRole('button', { name: 'Quay lại danh sách ghi chú' }).click();
    await page.getByRole('button', { name: 'Cài đặt Sticker' }).click();
    const preferencesDialog = page.getByRole('dialog', { name: 'Cài đặt MochiNote' });
    await preferencesDialog.getByRole('button', { name: 'Sao lưu & phục hồi' }).click();
    const portabilityDialog = page.getByRole('dialog', { name: 'Sao lưu dữ liệu' });
    const downloadPromise = page.waitForEvent('download');
    await portabilityDialog.getByRole('button', { name: 'Tải file JSON' }).click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).not.toBeNull();

    await portabilityDialog.locator('#backup-file').setInputFiles(backupPath);
    await expect(portabilityDialog.getByText('Backup hợp lệ')).toBeVisible();
    await portabilityDialog.getByLabel('Thay thế toàn bộ').click();
    await portabilityDialog.getByRole('button', { name: 'Xác nhận thay thế' }).click();
    await expect(page.getByRole('status')).toContainText('Đã thay thế dữ liệu bằng bản sao lưu');
    await portabilityDialog.getByRole('button', { name: 'Đóng cài đặt dữ liệu' }).click();
    await preferencesDialog.getByRole('button', { name: 'Đóng cài đặt' }).click();

    await page.getByRole('button', { name: /Link backup regression/ }).click();
    await expect(page.locator('.note-detail-body a')).toHaveAttribute('href', 'https://example.com/mochinote');
    await page.close();
  } finally {
    await context.close();
    await rm(userDataDir, { force: true, recursive: true });
  }
});
