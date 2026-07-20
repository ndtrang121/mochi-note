import { migrateSnapshot, type LegacyDeviceSyncSnapshot } from './snapshotMerge';
import type { DeviceSyncSnapshot, SyncStateStore } from './syncTypes';

const STORAGE_KEY = 'google-drive-sync-state';

interface BrowserStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class BrowserSyncStateStore implements SyncStateStore {
  constructor(private readonly storage: BrowserStorageArea = browser.storage.local) {}

  async clear() {
    await this.storage.remove(STORAGE_KEY);
  }

  async get() {
    const stored = (await this.storage.get(STORAGE_KEY))[STORAGE_KEY];
    if (!isSnapshot(stored)) return undefined;
    return migrateSnapshot(stored, stored.deviceId, stored.generatedAt);
  }

  async put(snapshot: DeviceSyncSnapshot) {
    await this.storage.set({ [STORAGE_KEY]: snapshot });
  }
}

function isSnapshot(value: unknown): value is DeviceSyncSnapshot | LegacyDeviceSyncSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as { deviceId?: unknown; formatVersion?: unknown; generatedAt?: unknown; records?: unknown };
  return (snapshot.formatVersion === 1 || snapshot.formatVersion === 2)
    && typeof snapshot.deviceId === 'string'
    && typeof snapshot.generatedAt === 'string'
    && Array.isArray(snapshot.records);
}
