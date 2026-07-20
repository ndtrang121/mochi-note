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
    return isSnapshot(stored) ? stored : undefined;
  }

  async put(snapshot: DeviceSyncSnapshot) {
    await this.storage.set({ [STORAGE_KEY]: snapshot });
  }
}

function isSnapshot(value: unknown): value is DeviceSyncSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<DeviceSyncSnapshot>;
  return snapshot.formatVersion === 1 && typeof snapshot.deviceId === 'string' && Array.isArray(snapshot.records);
}
