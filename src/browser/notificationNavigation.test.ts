import { describe, expect, it } from 'vitest';

import {
  createNotificationOwnerTarget,
  isFreshNotificationOwnerTarget,
  isNotificationOwnerMessage,
  isNotificationOwnerTarget,
} from './notificationNavigation';

describe('notification owner navigation', () => {
  it('creates and validates a note owner target', () => {
    const now = new Date('2026-07-19T06:00:00.000Z');
    const target = createNotificationOwnerTarget(
      { ownerId: 'note-1', ownerType: 'note' },
      now,
    );

    expect(target).toMatchObject({
      ownerId: 'note-1',
      ownerType: 'note',
      requestedAt: now.toISOString(),
    });
    expect(isNotificationOwnerTarget(target)).toBe(true);
    expect(isNotificationOwnerMessage({
      target,
      type: 'mochi-note:navigate-notification-owner',
    })).toBe(true);
  });

  it('rejects malformed and stale navigation targets', () => {
    const target = createNotificationOwnerTarget(
      { ownerId: 'task-1', ownerType: 'task' },
      new Date('2026-07-19T06:00:00.000Z'),
    );

    expect(isNotificationOwnerTarget({ ...target, ownerType: 'folder' })).toBe(false);
    expect(isFreshNotificationOwnerTarget(target, Date.parse('2026-07-19T06:14:59.000Z'))).toBe(true);
    expect(isFreshNotificationOwnerTarget(target, Date.parse('2026-07-19T06:15:01.000Z'))).toBe(false);
  });
});
