import { openMochiDatabase } from '../db/database';
import { createDefaultDriveSyncService } from './driveSyncService';

export const DRIVE_SYNC_ALARM_NAME = 'mochi-google-drive-sync';
export const DRIVE_SYNC_DEBOUNCE_ALARM_NAME = 'mochi-google-drive-sync-debounce';
export const DRIVE_SYNC_INTERVAL_MINUTES = 5;
export const DRIVE_SYNC_DEBOUNCE_MILLISECONDS = 2_000;
export const DRIVE_SYNC_RUNTIME_MESSAGE_TYPE = 'mochi-note:drive-sync-runtime';
export const DRIVE_SYNC_REQUEST_MESSAGE_TYPE = 'mochi-note:drive-sync-request';
export const DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY = 'mochi-note:drive-sync-diagnostics';

export type DriveSyncRuntimePhase = 'error' | 'skipped' | 'synced' | 'syncing';
export type BackgroundDriveSyncPhase = DriveSyncRuntimePhase | 'requested';
export type BackgroundDriveSyncTrigger = 'debounce-alarm' | 'message' | 'periodic-alarm' | 'request' | 'startup';

export interface DriveSyncRuntimeMessage {
  completedAt?: string;
  error?: string;
  phase: DriveSyncRuntimePhase;
  type: typeof DRIVE_SYNC_RUNTIME_MESSAGE_TYPE;
}

export interface DriveSyncRequestMessage {
  reason: 'local-change';
  type: typeof DRIVE_SYNC_REQUEST_MESSAGE_TYPE;
}

export interface BackgroundDriveSyncDiagnostics {
  completedAt?: string;
  error?: string;
  phase: BackgroundDriveSyncPhase;
  requestedAt?: string;
  startedAt?: string;
  trigger: BackgroundDriveSyncTrigger;
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
    if (state.status !== 'ready' || !state.supportsBackgroundRefresh) {
      if (state.error) throw new Error(state.error);
      return false;
    }
    await service.sync();
    return true;
  } finally {
    database.close();
  }
}

export function isDriveSyncRequestMessage(value: unknown): value is DriveSyncRequestMessage {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === DRIVE_SYNC_REQUEST_MESSAGE_TYPE &&
    'reason' in value &&
    value.reason === 'local-change'
  );
}

export function isBackgroundDriveSyncDiagnostics(value: unknown): value is BackgroundDriveSyncDiagnostics {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'phase' in value &&
    (value.phase === 'requested' || value.phase === 'syncing' || value.phase === 'synced' || value.phase === 'skipped' || value.phase === 'error') &&
    'trigger' in value &&
    (value.trigger === 'request' || value.trigger === 'message' || value.trigger === 'debounce-alarm' || value.trigger === 'periodic-alarm' || value.trigger === 'startup')
  );
}

export async function getBackgroundDriveSyncDiagnostics() {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) return null;
  try {
    const result = await browser.storage.local.get(DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY);
    const value = result[DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY];
    return isBackgroundDriveSyncDiagnostics(value) ? value : null;
  } catch {
    return null;
  }
}

export async function recordBackgroundDriveSyncDiagnostics(changes: Partial<BackgroundDriveSyncDiagnostics> & Pick<BackgroundDriveSyncDiagnostics, 'phase' | 'trigger'>) {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  try {
    const current = await getBackgroundDriveSyncDiagnostics();
    const next: BackgroundDriveSyncDiagnostics = {
      ...(current ?? { phase: changes.phase, trigger: changes.trigger }),
      ...changes,
    };
    if (changes.phase !== 'error') delete next.error;
    await browser.storage.local.set({ [DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY]: next });
  } catch {
    // Diagnostics must never block note saving or Drive sync itself.
  }
}

export function listenForBackgroundDriveSyncDiagnostics(
  listener: (diagnostics: BackgroundDriveSyncDiagnostics | null) => void,
) {
  if (typeof browser === 'undefined' || !browser.storage?.onChanged) return () => undefined;
  const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== 'local') return;
    if (!(DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY in changes)) return;
    const value = changes[DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY]?.newValue;
    listener(isBackgroundDriveSyncDiagnostics(value) ? value : null);
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
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
  await recordBackgroundDriveSyncDiagnostics({
    phase: 'requested',
    requestedAt: new Date().toISOString(),
    trigger: 'request',
  });
  await browser.alarms.create(DRIVE_SYNC_DEBOUNCE_ALARM_NAME, {
    when: Date.now() + DRIVE_SYNC_DEBOUNCE_MILLISECONDS,
  });

  try {
    await browser.runtime?.sendMessage?.({
      reason: 'local-change',
      type: DRIVE_SYNC_REQUEST_MESSAGE_TYPE,
    } satisfies DriveSyncRequestMessage);
  } catch {
    // The alarm above is the durable fallback when the background worker cannot be messaged immediately.
  }
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
