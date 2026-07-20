import { openMochiDatabase } from '../db/database';
import { createDefaultDriveSyncService } from './driveSyncService';

export const DRIVE_SYNC_ALARM_NAME = 'mochi-google-drive-sync';
export const DRIVE_SYNC_DEBOUNCE_ALARM_NAME = 'mochi-google-drive-sync-debounce';
export const DRIVE_SYNC_INTERVAL_MINUTES = 5;
export const DRIVE_SYNC_DEBOUNCE_MILLISECONDS = 2_000;

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
