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
import { openSidePanel } from '../src/browser/openSidePanel';
import type { Reminder } from '../src/db/models';
import { createMochiRepositories } from '../src/db/repositories';
import { seedDatabase } from '../src/db/seed';
import { createCapturedPage } from '../src/features/capture/createCapturedPage';
import { dismissedReminder, snoozedReminder } from '../src/browser/reminderActions';
import { isQuickCaptureCommand } from '../src/browser/commands';
import {
  broadcastNotificationOwnerTarget,
  createNotificationOwnerTarget,
  storeNotificationOwnerTarget,
} from '../src/browser/notificationNavigation';

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
    const remindersWithOwners = await Promise.all(
      reminders.map(async (reminder) => ({
        owner: await reminderOwnerState(reminder, repositories),
        reminder,
      })),
    );
    const existingAlarms = await browser.alarms.getAll();
    const managedAlarms = existingAlarms.filter((alarm) =>
      reminderIdFromAlarmName(alarm.name),
    );

    await Promise.all(
      managedAlarms.map((alarm) => browser.alarms.clear(alarm.name)),
    );

    const now = Date.now();
    for (const { owner, reminder } of remindersWithOwners) {
      const scheduledAt = Date.parse(reminder.scheduledAt);
      if (
        owner.kind === 'available' &&
        reminder.enabled &&
        Number.isFinite(scheduledAt) &&
        scheduledAt > now
      ) {
        void browser.alarms.create(reminderAlarmName(reminder.id), { when: scheduledAt });
      }
    }
  });
}

async function reminderOwnerState(
  reminder: Reminder,
  repositories: ReturnType<typeof createMochiRepositories>,
) {
  if (reminder.ownerType === 'note') {
    const note = await repositories.notes.get(reminder.ownerId);
    if (!note) return { kind: 'missing' } as const;
    if (note.deletedAt) return { kind: 'trashed' } as const;
    return { kind: 'available', title: note.title } as const;
  }
  const task = await repositories.tasks.get(reminder.ownerId);
  return task
    ? { kind: 'available', title: task.title } as const
    : { kind: 'missing' } as const;
}

async function deliverReminder(reminderId: string) {
  await withRepositories(async (repositories) => {
    const reminder = await repositories.reminders.get(reminderId);
    if (!reminder?.enabled) {
      return;
    }

    const owner = await reminderOwnerState(reminder, repositories);
    if (owner.kind === 'trashed') return;
    if (owner.kind === 'missing') {
      await repositories.reminders.put({
        ...reminder,
        enabled: false,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    await browser.notifications.create(reminderAlarmName(reminder.id), {
      buttons: [
        { title: 'Nhắc lại 15 phút' },
        { title: 'Tắt reminder' },
      ],
      type: 'basic',
      iconUrl: browser.runtime.getURL('/brand/mochi-mascot.png'),
      title: 'MochiNote nhắc bạn',
      message: owner.title,
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

async function handleReminderNotificationAction(reminderId: string, buttonIndex: number) {
  await withRepositories(async (repositories) => {
    const reminder = await repositories.reminders.get(reminderId);
    if (!reminder) return;
    const updated = buttonIndex === 0
      ? snoozedReminder(reminder)
      : dismissedReminder(reminder);
    await repositories.reminders.put(updated);
    const alarmName = reminderAlarmName(reminder.id);
    await browser.alarms.clear(alarmName);
    if (updated.enabled) {
      await browser.alarms.create(alarmName, { when: Date.parse(updated.scheduledAt) });
    }
    await browser.notifications.clear(alarmName);
  });
}

async function handleReminderNotificationClick(reminderId: string) {
  const target = await withRepositories(async (repositories) => {
    const reminder = await repositories.reminders.get(reminderId);
    return reminder ? createNotificationOwnerTarget(reminder) : null;
  });

  if (target) {
    await storeNotificationOwnerTarget(target);
    await broadcastNotificationOwnerTarget(target);
  }
  await browser.notifications.clear(reminderAlarmName(reminderId));
  await openSidePanel();
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

async function captureActivePage(mode: PageCaptureMode, excerpt?: string): Promise<CapturePageResult> {
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const page = tab ? activePageFromTab(tab) : null;
    if (!page) {
      return { error: 'Không thể đọc trang hiện tại.', ok: false };
    }

    const note = await persistCapturedPage(page, mode, excerpt);
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
      void captureActivePage(message.mode, message.excerpt).then(sendResponse);
      return true;
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    const reminderId = reminderIdFromAlarmName(alarm.name);
    if (reminderId) {
      void deliverReminder(reminderId);
    }
  });

  browser.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    const reminderId = reminderIdFromAlarmName(notificationId);
    if (reminderId && (buttonIndex === 0 || buttonIndex === 1)) {
      void handleReminderNotificationAction(reminderId, buttonIndex);
    }
  });

  browser.notifications.onClicked.addListener((notificationId) => {
    const reminderId = reminderIdFromAlarmName(notificationId);
    if (reminderId) {
      void handleReminderNotificationClick(reminderId);
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === CAPTURE_CONTEXT_MENU_ID) {
      void captureFromContextMenu(info, tab);
    }
  });
});
