import type { Reminder } from '../db/models';

const PENDING_NOTIFICATION_OWNER_KEY = 'mochi-note:pending-notification-owner';
const MAX_PENDING_AGE_MS = 15 * 60 * 1000;

export interface NotificationOwnerTarget {
  ownerId: string;
  ownerType: Reminder['ownerType'];
  requestedAt: string;
  requestId: string;
}

interface NotificationOwnerMessage {
  target: NotificationOwnerTarget;
  type: 'mochi-note:navigate-notification-owner';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isNotificationOwnerTarget(value: unknown): value is NotificationOwnerTarget {
  if (!isRecord(value)) return false;
  return (
    typeof value.ownerId === 'string' &&
    value.ownerId.length > 0 &&
    (value.ownerType === 'note' || value.ownerType === 'task') &&
    typeof value.requestedAt === 'string' &&
    Number.isFinite(Date.parse(value.requestedAt)) &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0
  );
}

export function createNotificationOwnerTarget(
  reminder: Pick<Reminder, 'ownerId' | 'ownerType'>,
  now = new Date(),
): NotificationOwnerTarget {
  return {
    ownerId: reminder.ownerId,
    ownerType: reminder.ownerType,
    requestedAt: now.toISOString(),
    requestId: `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

export function isNotificationOwnerMessage(value: unknown): value is NotificationOwnerMessage {
  return (
    isRecord(value) &&
    value.type === 'mochi-note:navigate-notification-owner' &&
    isNotificationOwnerTarget(value.target)
  );
}

export function isFreshNotificationOwnerTarget(
  target: NotificationOwnerTarget,
  now = Date.now(),
) {
  const requestedAt = Date.parse(target.requestedAt);
  return requestedAt <= now && now - requestedAt <= MAX_PENDING_AGE_MS;
}

export async function storeNotificationOwnerTarget(target: NotificationOwnerTarget) {
  await browser.storage.session.set({ [PENDING_NOTIFICATION_OWNER_KEY]: target });
}

export async function clearNotificationOwnerTarget() {
  if (typeof browser === 'undefined') return;
  await browser.storage.session.remove(PENDING_NOTIFICATION_OWNER_KEY);
}

export async function takeNotificationOwnerTarget() {
  if (typeof browser === 'undefined') return null;
  const stored = await browser.storage.session.get(PENDING_NOTIFICATION_OWNER_KEY);
  await browser.storage.session.remove(PENDING_NOTIFICATION_OWNER_KEY);
  const target = stored[PENDING_NOTIFICATION_OWNER_KEY];
  return isNotificationOwnerTarget(target) && isFreshNotificationOwnerTarget(target)
    ? target
    : null;
}

export async function broadcastNotificationOwnerTarget(target: NotificationOwnerTarget) {
  try {
    await browser.runtime.sendMessage({
      target,
      type: 'mochi-note:navigate-notification-owner',
    } satisfies NotificationOwnerMessage);
  } catch {
    // A newly opening side panel will consume the target from session storage.
  }
}

export function listenForNotificationOwnerTargets(
  listener: (target: NotificationOwnerTarget) => void,
) {
  if (typeof browser === 'undefined') return () => undefined;
  const onMessage = (message: unknown) => {
    if (isNotificationOwnerMessage(message)) listener(message.target);
  };
  browser.runtime.onMessage.addListener(onMessage);
  return () => browser.runtime.onMessage.removeListener(onMessage);
}
