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
import { MOCHI_DATABASE_NAME, openMochiDatabase } from '../src/db/database';
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
import { readAuthState } from '../src/supabase/auth';
import { getDeviceId } from '../src/supabase/storage';
import {
  createSupabaseDataChangedMessage,
  isSupabaseSyncRequestMessage,
} from '../src/supabase/messages';
import { createCoalescedRunner } from '../src/supabase/coalescedRunner';
import { syncUserData } from '../src/supabase/sync';
import {
  isLocaleChangedMessage,
  readRepositoryLocale,
  tBackground,
} from '../src/i18n/background';
import { detectBrowserLocale } from '../src/i18n/locale';

const CAPTURE_CONTEXT_MENU_ID = 'mochi-note-capture-page';
const SUPABASE_SYNC_ALARM = 'mochi-supabase-sync';
const SUPABASE_SYNC_PERIOD_MINUTES = 5;

async function withRepositories<TResult>(
  operation: (
    repositories: ReturnType<typeof createMochiRepositories>,
  ) => Promise<TResult>,
) {
  const auth = await readAuthState();
  const databaseName = auth.user ? `${MOCHI_DATABASE_NAME}:${auth.user.id}` : MOCHI_DATABASE_NAME;
  const database = await openMochiDatabase(databaseName);
  try {
    if (!auth.user) await seedDatabase(database);
    return await operation(createMochiRepositories(database));
  } finally {
    database.close();
  }
}

async function readActiveLocale() {
  try {
    return await withRepositories((repositories) => readRepositoryLocale(repositories));
  } catch {
    return detectBrowserLocale();
  }
}

let fullSyncRequested = false;

async function syncAuthenticatedData() {
  const auth = await readAuthState();
  if (!auth.user) return;
  const deviceId = await getDeviceId();
  const database = await openMochiDatabase(`${MOCHI_DATABASE_NAME}:${auth.user.id}`);
  try {
    let shouldContinueSyncing: boolean;
    do {
      const pullScope = fullSyncRequested ? 'all' : 'pending';
      fullSyncRequested = false;
      const result = await syncUserData(
        database,
        auth.user.id,
        deviceId,
        undefined,
        { pullScope },
      );
      const { changedEntityTypes, ...syncState } = result;
      try {
        await browser.runtime.sendMessage(createSupabaseDataChangedMessage(
          auth.user.id,
          changedEntityTypes,
          syncState,
        ));
      } catch {
        // No extension view is currently open; IndexedDB remains the source of truth.
      }

      // A new mutation or full-sync request may arrive while the current network batch is active.
      shouldContinueSyncing = result.status !== 'blocked_quota' && (result.pendingCount > 0 || fullSyncRequested);
    } while (shouldContinueSyncing);
  } finally {
    database.close();
  }
}

const requestAuthenticatedSync = createCoalescedRunner(syncAuthenticatedData);

function requestFullAuthenticatedSync() {
  fullSyncRequested = true;
  return requestAuthenticatedSync();
}

function scheduleSupabaseSync() {
  void browser.alarms.create(SUPABASE_SYNC_ALARM, {
    periodInMinutes: SUPABASE_SYNC_PERIOD_MINUTES,
  });
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
    const locale = await readRepositoryLocale(repositories);
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
        { title: tBackground(locale, 'background.reminder.snooze') },
        { title: tBackground(locale, 'background.reminder.dismiss') },
      ],
      type: 'basic',
      iconUrl: browser.runtime.getURL('/brand/mochi-mascot.png'),
      title: tBackground(locale, 'background.reminder.title'),
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
  const locale = await readActiveLocale();
  try {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    const page = tab ? activePageFromTab(tab) : null;
    if (!page) {
      return { error: tBackground(locale, 'background.capture.readError'), ok: false };
    }

    const note = await persistCapturedPage(page, mode, excerpt);
    return { noteId: note.id, ok: true };
  } catch {
    return { error: tBackground(locale, 'background.capture.saveError'), ok: false };
  }
}

async function installCaptureContextMenu() {
  const locale = await readActiveLocale();
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    contexts: ['link', 'page', 'selection'],
    id: CAPTURE_CONTEXT_MENU_ID,
    title: tBackground(locale, 'background.context.capturePage'),
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
  const locale = await readActiveLocale();
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
      title: tBackground(locale, 'background.capture.savedTitle'),
      message: note.title,
    });
  } catch {
    await browser.notifications.create('mochi-capture:error', {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/brand/mochi-mascot.png'),
      title: tBackground(locale, 'background.capture.errorTitle'),
      message: tBackground(locale, 'background.capture.blockedMessage'),
    });
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    scheduleSupabaseSync();
    void requestFullAuthenticatedSync();
    void reconcileReminderAlarms();
    void installCaptureContextMenu();
  });

  browser.runtime.onStartup.addListener(() => {
    void requestFullAuthenticatedSync();
    void reconcileReminderAlarms();
  });

  browser.commands.onCommand.addListener((command) => {
    if (isQuickCaptureCommand(command)) {
      void openQuickCapture();
    }
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isSupabaseSyncRequestMessage(message)) {
      if (!message.entityTypes?.length) {
        void requestFullAuthenticatedSync();
      } else {
        void requestAuthenticatedSync();
      }
      return;
    }
    if (isReconcileRemindersMessage(message)) {
      void reconcileReminderAlarms();
    }
    if (isLocaleChangedMessage(message)) {
      void installCaptureContextMenu();
    }
    if (isCapturePageMessage(message)) {
      void captureActivePage(message.mode, message.excerpt).then(sendResponse);
      return true;
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SUPABASE_SYNC_ALARM) void requestFullAuthenticatedSync();

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
