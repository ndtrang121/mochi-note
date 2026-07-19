import { describe, expect, it } from 'vitest';

import type { Reminder } from '../db/models';
import { dismissedReminder, REMINDER_SNOOZE_MINUTES, snoozedReminder } from './reminderActions';

const reminder: Reminder = {
  createdAt: '2026-07-19T00:00:00.000Z',
  enabled: true,
  id: 'reminder-1',
  ownerId: 'task-1',
  ownerType: 'task',
  repeatRule: null,
  scheduledAt: '2026-07-19T01:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  updatedAt: '2026-07-19T00:00:00.000Z',
};

describe('reminder notification actions', () => {
  it('snoozes 15 minutes and keeps the reminder enabled', () => {
    const result = snoozedReminder(reminder, new Date('2026-07-19T01:00:00.000Z'));
    expect(result.enabled).toBe(true);
    expect(result.scheduledAt).toBe(new Date(Date.parse(reminder.scheduledAt) + REMINDER_SNOOZE_MINUTES * 60_000).toISOString());
  });

  it('dismisses a reminder without changing its owner', () => {
    expect(dismissedReminder(reminder, new Date('2026-07-19T01:00:00.000Z'))).toMatchObject({
      enabled: false,
      id: reminder.id,
      ownerId: reminder.ownerId,
    });
  });
});
