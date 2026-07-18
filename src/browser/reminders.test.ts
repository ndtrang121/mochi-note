import { describe, expect, it } from 'vitest';

import type { Reminder } from '../db/models';
import {
  isReconcileRemindersMessage,
  nextReminderSchedule,
  reminderAlarmName,
  reminderIdFromAlarmName,
} from './reminders';

const reminder: Reminder = {
  id: 'reminder-test',
  ownerId: 'note-test',
  ownerType: 'note',
  scheduledAt: '2026-07-19T03:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
  repeatRule: null,
  enabled: true,
  createdAt: '2026-07-18T03:00:00.000Z',
  updatedAt: '2026-07-18T03:00:00.000Z',
};

describe('reminder browser contracts', () => {
  it('round-trips reminder alarm names', () => {
    const name = reminderAlarmName(reminder.id);
    expect(reminderIdFromAlarmName(name)).toBe(reminder.id);
    expect(reminderIdFromAlarmName('unrelated-alarm')).toBeNull();
  });

  it('validates versioned reconciliation messages', () => {
    expect(
      isReconcileRemindersMessage({ type: 'reminders:reconcile', version: 1 }),
    ).toBe(true);
    expect(
      isReconcileRemindersMessage({ type: 'reminders:reconcile', version: 2 }),
    ).toBe(false);
  });

  it('advances daily and weekly reminders beyond the current time', () => {
    expect(
      nextReminderSchedule(
        { ...reminder, repeatRule: 'FREQ=DAILY' },
        new Date('2026-07-21T04:00:00.000Z'),
      ),
    ).toBe('2026-07-22T03:00:00.000Z');
    expect(
      nextReminderSchedule(
        { ...reminder, repeatRule: 'FREQ=WEEKLY' },
        new Date('2026-07-20T03:00:00.000Z'),
      ),
    ).toBe('2026-07-26T03:00:00.000Z');
    expect(nextReminderSchedule(reminder)).toBeNull();
  });
});
