import type { Reminder } from '../db/models';

export const REMINDER_SNOOZE_MINUTES = 15;

export function snoozedReminder(reminder: Reminder, now = new Date()) {
  const scheduledAt = new Date(now.getTime() + REMINDER_SNOOZE_MINUTES * 60_000).toISOString();
  return {
    ...reminder,
    enabled: true,
    scheduledAt,
    updatedAt: now.toISOString(),
  };
}

export function dismissedReminder(reminder: Reminder, now = new Date()) {
  return {
    ...reminder,
    enabled: false,
    updatedAt: now.toISOString(),
  };
}
