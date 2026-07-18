import {
  isReconcileRemindersMessage,
  nextReminderSchedule,
  reminderAlarmName,
  reminderIdFromAlarmName,
} from '../src/browser/reminders';
import { openMochiDatabase } from '../src/db/database';
import type { Reminder } from '../src/db/models';
import { createMochiRepositories } from '../src/db/repositories';
import { seedDatabase } from '../src/db/seed';

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

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void reconcileReminderAlarms();
  });

  browser.runtime.onStartup.addListener(() => {
    void reconcileReminderAlarms();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (isReconcileRemindersMessage(message)) {
      void reconcileReminderAlarms();
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    const reminderId = reminderIdFromAlarmName(alarm.name);
    if (reminderId) {
      void deliverReminder(reminderId);
    }
  });
});
