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

async function selectPlanningDate(page: Page, date: string) {
  await page.getByRole('button', { name: 'Chọn ngày công việc' }).click();
  await page.getByRole('textbox', { name: 'Ngày công việc', exact: true }).fill(date);
  await page.getByRole('button', { name: 'Xem nhiệm vụ' }).click();
}
test('loads the extension, persists quick capture, and keeps core surfaces accessible', async ({ extensionContext, extensionId }, testInfo) => {
  const popup = await extensionContext.newPage();
  await popup.setViewportSize({ width: 360, height: 560 });
  await popup.emulateMedia({ reducedMotion: 'reduce' });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup).toHaveTitle('MochiNote nhanh');
  await expect(popup.getByRole('heading', { level: 1, name: 'Sticky mới' })).toBeVisible();
  await popup.getByRole('textbox', { name: 'Tiêu đề ghi chú' }).fill('E2E capture note');
  await popup.getByRole('textbox', { name: 'Nội dung ghi chú' }).fill('Created directly from the extension popup');
  await expect(popup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(popup);
  await popup.getByRole('button', { name: 'Lưu ghi chú' }).click();

  const sidePanel = await extensionContext.newPage();
  const sidePanelErrors: string[] = [];
  sidePanel.on('console', (message) => {
    if (message.type() === 'error') sidePanelErrors.push(message.text());
  });
  sidePanel.on('pageerror', (error) => sidePanelErrors.push(error.message));
  await sidePanel.setViewportSize({ width: 400, height: 700 });
  await sidePanel.emulateMedia({ reducedMotion: 'reduce' });
  await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(sidePanel.getByRole('button', { name: 'Sticky' })).toBeVisible();
  await expect(sidePanel.getByRole('button', { name: 'Notes' })).toHaveCount(0);

  await sidePanel.getByRole('button', { name: 'Tasks' }).click();
  await sidePanel.getByRole('button', { name: 'Cài đặt' }).click();
  const preferencesDialog = sidePanel.getByRole('dialog', { name: 'Cài đặt MochiNote' });
  await expect(preferencesDialog).toBeVisible();
  await preferencesDialog.getByRole('button', { name: 'Tối', exact: true }).click();
  await preferencesDialog.getByRole('button', { name: 'Danh sách', exact: true }).click();
  await expect(sidePanel.locator('.side-panel-app')).toHaveAttribute('data-theme', 'dark');
  await expect(sidePanel.locator('.side-panel-app')).toHaveAttribute('data-layout', 'list');
  await sidePanel.setViewportSize({ width: 376, height: 346 });
  const darkThemeLayout = await sidePanel.evaluate(() => {
    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      return 0.2126 * channel(channels[0]) + 0.7152 * channel(channels[1]) + 0.0722 * channel(channels[2]);
    };
    const contrast = (foreground: string, background: string) => {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };
    const card = document.querySelector<HTMLElement>('.task-stat-card');
    const label = document.querySelector<HTMLElement>('.task-stat-card__label');
    const value = document.querySelector<HTMLElement>('.task-stat-card strong');
    const nav = document.querySelector<HTMLElement>('.bottom-navigation');
    const items = [...document.querySelectorAll<HTMLElement>('.bottom-navigation__item')];
    if (!card || !label || !value || !nav || items.length !== 3) return null;
    const cardBackground = getComputedStyle(card).backgroundColor;
    const navRect = nav.getBoundingClientRect();
    const itemRects = items.map((item) => item.getBoundingClientRect());
    return {
      labelContrast: contrast(getComputedStyle(label).color, cardBackground),
      valueContrast: contrast(getComputedStyle(value).color, cardBackground),
      itemWidths: itemRects.map((rect) => rect.width),
      rightInset: navRect.right - itemRects[2].right,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
  expect(darkThemeLayout).not.toBeNull();
  expect(darkThemeLayout?.labelContrast).toBeGreaterThanOrEqual(4.5);
  expect(darkThemeLayout?.valueContrast).toBeGreaterThanOrEqual(4.5);
  expect(Math.max(...(darkThemeLayout?.itemWidths ?? [])) - Math.min(...(darkThemeLayout?.itemWidths ?? []))).toBeLessThan(1);
  expect(darkThemeLayout?.rightInset).toBeLessThanOrEqual(9);
  expect(darkThemeLayout?.pageWidth).toBe(376);
  await testInfo.attach('dark-theme-navigation-376x346', {
    body: await sidePanel.screenshot(),
    contentType: 'image/png',
  });
  await sidePanel.setViewportSize({ width: 400, height: 700 });
  await preferencesDialog.getByRole('button', { name: 'Sao lưu & phục hồi' }).click();
  const portabilityDialog = sidePanel.getByRole('dialog', { name: 'Sao lưu dữ liệu' });
  await expect(portabilityDialog).toBeVisible();
  await assertNoAccessibilityViolations(sidePanel);
  await portabilityDialog.getByRole('button', { name: 'Tải file JSON' }).click();
  await expect(sidePanel.getByRole('status')).toContainText('Đã tạo bản sao lưu');
  await portabilityDialog.getByRole('button', { name: 'Đóng cài đặt dữ liệu' }).click();
  await preferencesDialog.getByRole('button', { name: 'Đóng cài đặt' }).click();

  const darkPopup = await extensionContext.newPage();
  await darkPopup.setViewportSize({ width: 332, height: 560 });
  await darkPopup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(darkPopup.locator('.popup-sticky-app')).toHaveAttribute('data-theme', 'dark');
  await expect(darkPopup.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(darkPopup);
  await testInfo.attach('dark-popup-332px', {
    body: await darkPopup.screenshot(),
    contentType: 'image/png',
  });
  await darkPopup.close();

  await sidePanel.getByRole('button', { name: 'Tasks' }).click();
  const planningDates = await sidePanel.evaluate(() => {
    const toIso = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date();
    const originalDay = nextMonth.getDate();
    nextMonth.setDate(1);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    nextMonth.setDate(Math.min(originalDay, lastDay));
    return {
      nextMonth: toIso(nextMonth),
      nextWeek: toIso(nextWeek),
      today: toIso(new Date()),
      tomorrow: toIso(tomorrow),
      yesterday: toIso(yesterday),
    };
  });
  await expect(sidePanel.locator('.week-rail__day').first()).toContainText('Hôm nay');
  await expect(sidePanel.getByText('Đã hoàn thành')).toHaveCount(0);
  await sidePanel.getByRole('button', { name: 'Thêm nhiệm vụ' }).click();
  await expect(sidePanel.getByLabel('Nhiệm vụ mới')).toBeVisible();
  await sidePanel.getByLabel('Nhiệm vụ mới').fill('E2E task bị trễ');
  await sidePanel.getByLabel('Ngày đến hạn').fill(planningDates.yesterday);
  await sidePanel.getByLabel('Thư mục nhiệm vụ').selectOption('');
  await sidePanel.getByRole('button', { name: 'Thêm', exact: true }).click();
  await sidePanel.locator('.week-rail__day').first().click();
  const overdueTask = sidePanel.getByTestId('task-row').filter({ hasText: 'E2E task bị trễ' });
  await expect(overdueTask).toContainText('Trễ từ');
  const completionOrderIsValid = await sidePanel.locator('.task-list').evaluate((list) => {
    const rows = [...list.querySelectorAll<HTMLElement>('[data-testid="task-row"]')];
    const states = rows.map((row) => row.querySelector<HTMLButtonElement>('.task-row__check')?.getAttribute('aria-pressed'));
    const firstCompleted = states.indexOf('true');
    return firstCompleted > 0 && states.slice(firstCompleted).every((state) => state === 'true');
  });
  expect(completionOrderIsValid).toBe(true);

  await sidePanel.getByRole('button', { name: 'Thêm nhiệm vụ' }).click();
  await sidePanel.getByLabel('Nhiệm vụ mới').fill('E2E task hàng ngày');
  await sidePanel.getByLabel('Lặp lại').selectOption('FREQ=DAILY');
  await sidePanel.getByLabel('Thư mục nhiệm vụ').selectOption('');
  await sidePanel.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(sidePanel.locator('.data-operation-status')).toBeVisible();
  await sidePanel.waitForTimeout(5_100);
  await expect(sidePanel.locator('.data-operation-status')).toHaveCount(0);

  await selectPlanningDate(sidePanel, planningDates.tomorrow);
  await expect(sidePanel.getByText('E2E task hàng ngày')).toBeVisible();
  const dailyTomorrow = sidePanel.getByTestId('task-row').filter({ hasText: 'E2E task hàng ngày' });
  await dailyTomorrow.locator('.task-row__check').click();
  await expect(dailyTomorrow.locator('.task-row__check')).toHaveAttribute('aria-pressed', 'true');
  await selectPlanningDate(sidePanel, planningDates.nextWeek);
  const dailyNextWeek = sidePanel.getByTestId('task-row').filter({ hasText: 'E2E task hàng ngày' });
  await expect(dailyNextWeek.locator('.task-row__check')).toHaveAttribute('aria-pressed', 'false');

  await selectPlanningDate(sidePanel, planningDates.today);
  await sidePanel.getByRole('button', { name: 'Thêm nhiệm vụ' }).click();
  await sidePanel.getByLabel('Nhiệm vụ mới').fill('E2E task hàng tuần');
  await sidePanel.getByLabel('Lặp lại').selectOption('FREQ=WEEKLY');
  await sidePanel.getByLabel('Thư mục nhiệm vụ').selectOption('');
  await sidePanel.getByRole('button', { name: 'Thêm', exact: true }).click();
  await sidePanel.getByRole('button', { name: 'Thêm nhiệm vụ' }).click();
  await sidePanel.getByLabel('Nhiệm vụ mới').fill('E2E task hàng tháng');
  await sidePanel.getByLabel('Lặp lại').selectOption('FREQ=MONTHLY');
  await sidePanel.getByLabel('Thư mục nhiệm vụ').selectOption('');
  await sidePanel.getByRole('button', { name: 'Thêm', exact: true }).click();

  await selectPlanningDate(sidePanel, planningDates.nextWeek);
  await expect(sidePanel.getByText('E2E task hàng tuần')).toBeVisible();
  await selectPlanningDate(sidePanel, planningDates.nextMonth);
  await expect(sidePanel.getByText('E2E task hàng tháng', { exact: true })).toBeVisible();
  await expect(sidePanel.getByText('Đã hoàn thành')).toHaveCount(0);
  await assertNoAccessibilityViolations(sidePanel);
  await testInfo.attach('recurring-task-projections-400px', {
    body: await sidePanel.screenshot(),
    contentType: 'image/png',
  });

  await sidePanel.locator('.tasks-screen__heading-row h1').click();
  await sidePanel.keyboard.press('Control+/');
  await expect(sidePanel.getByRole('dialog', { name: 'Phím tắt MochiNote' })).toBeVisible();
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.getByRole('button', { name: 'Đóng trợ giúp phím tắt' }).click();

  await sidePanel.getByRole('button', { name: 'Folders' }).click();
  await sidePanel.getByRole('button', { name: 'Thêm thư mục' }).click();
  await expect(sidePanel.getByLabel('Tên thư mục')).toBeVisible();
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.getByRole('button', { name: 'Đóng biểu mẫu thư mục' }).click();

  await sidePanel.getByRole('button', { name: 'Sticky' }).click();
  await expect(sidePanel.getByText('E2E capture note')).toBeVisible();
  await expect(sidePanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(sidePanel);

  for (const tabName of ['Tasks', 'Sticky', 'Folders']) {
    await sidePanel.getByRole('button', { name: tabName }).click();
    await expect(sidePanel.getByRole('main')).toBeVisible();
    await assertNoAccessibilityViolations(sidePanel);
  }

  await sidePanel.getByRole('button', { name: 'Mở thư mục Công việc' }).click();
  await expect(sidePanel.getByRole('heading', { level: 1, name: 'Công việc' })).toBeVisible();
  await expect(sidePanel.getByText('3 nhiệm vụ · 2 Sticky · 0 thư mục con')).toBeVisible();
  await assertNoAccessibilityViolations(sidePanel);
  await testInfo.attach('folder-content-view-400px', {
    body: await sidePanel.screenshot(),
    contentType: 'image/png',
  });
  await sidePanel.getByRole('button', { name: /Kế hoạch tháng 6/ }).click();
  await expect(sidePanel.getByRole('heading', { level: 1, name: 'Chi tiết ghi chú' })).toBeVisible();
  await sidePanel.getByRole('button', { name: 'Quay lại danh sách ghi chú' }).click();

  await sidePanel.setViewportSize({ width: 480, height: 700 });
  await expect(sidePanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.setViewportSize({ width: 400, height: 700 });

  await sidePanel.getByRole('button', { name: 'Sticky' }).click();
  await sidePanel.getByRole('button', { name: 'Cài đặt Sticker' }).click();
  await sidePanel.getByRole('button', { name: 'Lưới thẻ', exact: true }).click();
  await sidePanel.getByRole('button', { name: 'Đóng cài đặt' }).click();
  const stickyCardLayout = await sidePanel.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.sticky-card')];
    return cards.map((card) => {
      const title = card.querySelector<HTMLElement>('h2');
      const preview = card.querySelector<HTMLElement>('ul');
      const tags = card.querySelector<HTMLElement>('.sticky-card__tags');
      const cardRect = card.getBoundingClientRect();
      return {
        height: cardRect.height,
        previewLines: preview?.querySelectorAll('li').length ?? 0,
        tagsClearPreview: !tags || !preview || tags.getBoundingClientRect().top >= preview.getBoundingClientRect().bottom,
        titleOffset: title ? title.getBoundingClientRect().top - cardRect.top : null,
      };
    });
  });
  expect(stickyCardLayout).toHaveLength(5);
  expect(Math.max(...stickyCardLayout.map((card) => card.height)) - Math.min(...stickyCardLayout.map((card) => card.height))).toBeLessThan(1);
  expect(stickyCardLayout.every((card) => card.previewLines <= 2 && card.tagsClearPreview)).toBe(true);
  expect(Math.max(...stickyCardLayout.flatMap((card) => card.titleOffset ?? [])) - Math.min(...stickyCardLayout.flatMap((card) => card.titleOffset ?? []))).toBeLessThan(1);
  await testInfo.attach('sticky-card-clamping-400px', {
    body: await sidePanel.screenshot(),
    contentType: 'image/png',
  });
  await sidePanel.getByRole('button', { name: 'Lọc ghi chú', exact: true }).click();
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.getByRole('button', { name: 'Đóng tìm kiếm' }).click();

  await sidePanel.getByRole('button', { name: 'Thêm ghi chú' }).click();
  await sidePanel.getByRole('textbox', { name: 'Tiêu đề ghi chú' }).fill('E2E tagged note');
  await sidePanel.getByRole('textbox', { name: 'Nội dung ghi chú' }).fill('Tag filtering regression');
  await sidePanel.getByRole('textbox', { name: 'Thêm thẻ' }).fill('release');
  await sidePanel.getByRole('textbox', { name: 'Thêm thẻ' }).press('Enter');
  await expect(sidePanel.getByText('#release')).toBeVisible();
  await sidePanel.setViewportSize({ width: 320, height: 700 });
  await expect(sidePanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.setViewportSize({ width: 400, height: 700 });
  await sidePanel.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(sidePanel.getByLabel('Thẻ ghi chú')).toContainText('#release');
  await assertNoAccessibilityViolations(sidePanel);
  await sidePanel.getByRole('button', { name: 'Xóa', exact: true }).click();
  await sidePanel.getByRole('button', { name: 'Chuyển vào thùng rác' }).click();
  await expect(sidePanel.getByRole('status')).toContainText('thùng rác');
  await sidePanel.getByRole('button', { name: 'Hoàn tác' }).click();
  await sidePanel.getByRole('button', { name: /E2E tagged note/ }).click();
  await sidePanel.getByRole('button', { name: 'Quay lại danh sách ghi chú' }).click();
  await sidePanel.getByRole('button', { name: 'Lọc ghi chú', exact: true }).click();
  await sidePanel.getByLabel('Lọc theo thẻ').selectOption('release');
  await sidePanel.getByRole('button', { name: 'Xem kết quả' }).click();
  await expect(sidePanel.getByText('E2E tagged note')).toBeVisible();
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
