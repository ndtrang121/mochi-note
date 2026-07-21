import { openMochiDatabase } from '../db/database';
import { createDefaultDriveSyncService } from './driveSyncService';

export const DRIVE_SYNC_ALARM_NAME = 'mochi-google-drive-sync';
export const DRIVE_SYNC_DEBOUNCE_ALARM_NAME = 'mochi-google-drive-sync-debounce';
export const DRIVE_SYNC_INTERVAL_MINUTES = 5;
export const DRIVE_SYNC_DEBOUNCE_MILLISECONDS = 2_000;
export const DRIVE_SYNC_RUNTIME_MESSAGE_TYPE = 'mochi-note:drive-sync-runtime';

export type DriveSyncRuntimePhase = 'error' | 'skipped' | 'synced' | 'syncing';

export interface DriveSyncRuntimeMessage {
  completedAt?: string;
  error?: string;
  phase: DriveSyncRuntimePhase;
  type: typeof DRIVE_SYNC_RUNTIME_MESSAGE_TYPE;
}

export function isDriveSyncAlarm(alarmName: string) {
  return (
    alarmName === DRIVE_SYNC_ALARM_NAME ||
    alarmName === DRIVE_SYNC_DEBOUNCE_ALARM_NAME
  );
}

export async function runRememberedDriveSync() {
  const database = await openMochiDatabase();
  try {
    const service = createDefaultDriveSyncService(database);
    const state = await service.initialize();
    if (state.status !== 'ready' || !state.supportsBackgroundRefresh) return false;
    await service.sync();
    return true;
  } finally {
    database.close();
  }
}

export function isDriveSyncRuntimeMessage(value: unknown): value is DriveSyncRuntimeMessage {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === DRIVE_SYNC_RUNTIME_MESSAGE_TYPE &&
    'phase' in value &&
    (value.phase === 'error' || value.phase === 'skipped' || value.phase === 'synced' || value.phase === 'syncing')
  );
}

export async function broadcastDriveSyncRuntimeState(message: Omit<DriveSyncRuntimeMessage, 'type'>) {
  if (typeof browser === 'undefined' || !browser.runtime?.sendMessage) return;
  try {
    await browser.runtime.sendMessage({
      ...message,
      type: DRIVE_SYNC_RUNTIME_MESSAGE_TYPE,
    } satisfies DriveSyncRuntimeMessage);
  } catch {
    // Side panel or popup may be closed; the next open initializes from persisted sync state.
  }
}

export function listenForDriveSyncRuntimeState(
  listener: (message: DriveSyncRuntimeMessage) => void,
) {
  if (typeof browser === 'undefined' || !browser.runtime?.onMessage) return () => undefined;
  const onMessage = (message: unknown) => {
    if (isDriveSyncRuntimeMessage(message)) listener(message);
  };
  browser.runtime.onMessage.addListener(onMessage);
  return () => browser.runtime.onMessage.removeListener(onMessage);
}

export async function requestDriveSyncSoon() {
  await browser.alarms.create(DRIVE_SYNC_DEBOUNCE_ALARM_NAME, {
    when: Date.now() + DRIVE_SYNC_DEBOUNCE_MILLISECONDS,
  });
}

export async function ensureDriveSyncAlarm() {
  const existing = await browser.alarms.get(DRIVE_SYNC_ALARM_NAME);
  if (!existing) {
    await browser.alarms.create(DRIVE_SYNC_ALARM_NAME, {
      delayInMinutes: DRIVE_SYNC_INTERVAL_MINUTES,
      periodInMinutes: DRIVE_SYNC_INTERVAL_MINUTES,
    });
  }
}
