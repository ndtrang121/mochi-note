import type { Reminder } from '../db/models';

export const REMINDER_ALARM_PREFIX = 'mochi-reminder:';

export interface ReconcileRemindersMessage {
  type: 'reminders:reconcile';
  version: 1;
}

export function reminderAlarmName(reminderId: string) {
  return `${REMINDER_ALARM_PREFIX}${reminderId}`;
}

export function reminderIdFromAlarmName(name: string) {
  return name.startsWith(REMINDER_ALARM_PREFIX)
    ? name.slice(REMINDER_ALARM_PREFIX.length)
    : null;
}

export function isReconcileRemindersMessage(
  value: unknown,
): value is ReconcileRemindersMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Partial<ReconcileRemindersMessage>;
  return message.type === 'reminders:reconcile' && message.version === 1;
}

export function nextReminderSchedule(reminder: Reminder, now = new Date()) {
  const interval = reminder.repeatRule === 'FREQ=DAILY'
    ? 86_400_000
    : reminder.repeatRule === 'FREQ=WEEKLY'
      ? 604_800_000
      : null;

  if (!interval) {
    return null;
  }

  let scheduledAt = Date.parse(reminder.scheduledAt);
  if (!Number.isFinite(scheduledAt)) {
    return null;
  }

  while (scheduledAt <= now.getTime()) {
    scheduledAt += interval;
  }

  return new Date(scheduledAt).toISOString();
}

export async function requestReminderReconciliation() {
  if (typeof browser === 'undefined' || !browser.runtime?.id) {
    return false;
  }

  try {
    const message: ReconcileRemindersMessage = {
      type: 'reminders:reconcile',
      version: 1,
    };
    await browser.runtime.sendMessage(message);
    return true;
  } catch {
    return false;
  }
}
