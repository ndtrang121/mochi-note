import {
  isReconcileRemindersMessage,
  nextReminderSchedule,
  reminderAlarmName,
  reminderIdFromAlarmName,
} from '../src/browser/reminders';
import {
  activePageFromTab,
  isCapturePageMessage,
  type ActivePageMetadata,
  type CapturePageResult,
  type PageCaptureMode,
} from '../src/browser/pageCapture';
import { openMochiDatabase } from '../src/db/database';
import type { Reminder } from '../src/db/models';
import { createMochiRepositories } from '../src/db/repositories';
import { seedDatabase } from '../src/db/seed';
import { createCapturedPage } from '../src/features/capture/createCapturedPage';
import { isQuickCaptureCommand } from '../src/browser/commands';

const CAPTURE_CONTEXT_MENU_ID = 'mochi-note-capture-page';

async function withRepositories<TResult>(
  operation: (
    repositories: ReturnType<typeof createMochiRepositories>,
  ) => Promise<TResult>,
) {
  const database = await openMochiDatabase();
  try {
    await seedDatabase(database);
    return await operation(createMochiRepositories(database));
  } finally {
    database.close();
  }
}

async function reconcileReminderAlarms() {
  await withRepositories(async (repositories) => {
    const reminders = await repositories.reminders.list();
    const existingAlarms = await browser.alarms.getAll();
    const managedAlarms = existingAlarms.filter((alarm) =>
      reminderIdFromAlarmName(alarm.name),
    );

    await Promise.all(
      managedAlarms.map((alarm) => browser.alarms.clear(alarm.name)),
    );

    const now = Date.now();
    for (const reminder of reminders) {
      const scheduledAt = Date.parse(reminder.scheduledAt);
      if (reminder.enabled && Number.isFinite(scheduledAt) && scheduledAt > now) {
        void browser.alarms.create(reminderAlarmName(reminder.id), { when: scheduledAt });
      }
    }
  });
}

async function reminderOwnerTitle(
  reminder: Reminder,
  repositories: ReturnType<typeof createMochiRepositories>,
) {
  if (reminder.ownerType === 'note') {
    return (await repositories.notes.get(reminder.ownerId))?.title;
  }
  return (await repositories.tasks.get(reminder.ownerId))?.title;
}

async function deliverReminder(reminderId: string) {
  await withRepositories(async (repositories) => {
    const reminder = await repositories.reminders.get(reminderId);
    if (!reminder?.enabled) {
      return;
    }

    const ownerTitle = await reminderOwnerTitle(reminder, repositories);
    if (!ownerTitle) {
      await repositories.reminders.put({
        ...reminder,
        enabled: false,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    await browser.notifications.create(reminderAlarmName(reminder.id), {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/brand/mochi-mascot.png'),
      title: 'MochiNote nhắc bạn',
      message: ownerTitle,
    });

    const nextSchedule = nextReminderSchedule(reminder);
    const updatedAt = new Date().toISOString();
    await repositories.reminders.put({
      ...reminder,
      enabled: Boolean(nextSchedule),
      scheduledAt: nextSchedule ?? reminder.scheduledAt,
      updatedAt,
    });

    if (nextSchedule) {
      void browser.alarms.create(reminderAlarmName(reminder.id), {
        when: Date.parse(nextSchedule),
      });
    }
  });
}

async function persistCapturedPage(
  page: ActivePageMetadata,
  mode: PageCaptureMode,
  excerpt?: string,
) {
  let screenshot: Blob | undefined;
  if (mode === 'visible') {
    const dataUrl = await browser.tabs.captureVisibleTab(page.windowId, { format: 'png' });
    screenshot = await (await fetch(dataUrl)).blob();
  }

  const records = createCapturedPage({ excerpt, mode, page, screenshot });
  await withRepositories(async (repositories) => {
    await Promise.all([
      repositories.notes.put(records.note),
      ...(records.attachment ? [repositories.attachments.put(records.attachment)] : []),
    ]);
  });
  return records.note;
}

async function captureActivePage(mode: PageCaptureMode): Promise<CapturePageResult> {
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const page = tab ? activePageFromTab(tab) : null;
    if (!page) {
      return { error: 'Không thể đọc trang hiện tại.', ok: false };
    }

    const note = await persistCapturedPage(page, mode);
    return { noteId: note.id, ok: true };
  } catch {
    return { error: 'Không thể lưu trang hiện tại.', ok: false };
  }
}

async function installCaptureContextMenu() {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    contexts: ['link', 'page', 'selection'],
    id: CAPTURE_CONTEXT_MENU_ID,
    title: 'Lưu trang vào MochiNote',
  });
}

async function openQuickCapture() {
  const action = browser.action as typeof browser.action & { openPopup?: () => Promise<void> };
  if (action.openPopup) {
    try {
      await action.openPopup();
      return;
    } catch {
      // Older Chromium versions can expose the API but reject it from a command.
    }
  }

  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.windowId === undefined) return;
  const sidePanel = browser.sidePanel as typeof browser.sidePanel & { open?: (options: { windowId: number }) => Promise<void> };
  if (sidePanel.open) {
    await sidePanel.open({ windowId: tab.windowId });
  }
}

async function captureFromContextMenu(
  info: Browser.contextMenus.OnClickData,
  tab: Browser.tabs.Tab | undefined,
) {
  const page = tab ? activePageFromTab(tab) : null;
  if (!page) {
    return;
  }

  try {
    const note = await persistCapturedPage(
      page,
      'visible',
      info.selectionText || info.linkUrl,
    );
    await browser.notifications.create(`mochi-capture:${note.id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/brand/mochi-mascot.png'),
      title: 'Đã lưu vào MochiNote',
      message: note.title,
    });
  } catch {
    await browser.notifications.create('mochi-capture:error', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/brand/mochi-mascot.png'),
      title: 'Chưa thể lưu trang',
      message: 'Trang này không cho phép chụp nội dung hiển thị.',
    });
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void reconcileReminderAlarms();
    void installCaptureContextMenu();
  });

  browser.runtime.onStartup.addListener(() => {
    void reconcileReminderAlarms();
  });

  browser.commands.onCommand.addListener((command) => {
    if (isQuickCaptureCommand(command)) {
      void openQuickCapture();
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isReconcileRemindersMessage(message)) {
      void reconcileReminderAlarms();
    }
    if (isCapturePageMessage(message)) {
      void captureActivePage(message.mode).then(sendResponse);
      return true;
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    const reminderId = reminderIdFromAlarmName(alarm.name);
    if (reminderId) {
      void deliverReminder(reminderId);
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === CAPTURE_CONTEXT_MENU_ID) {
      void captureFromContextMenu(info, tab);
    }
  });
});
