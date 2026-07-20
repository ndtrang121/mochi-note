import { migrateSnapshot, type LegacyDeviceSyncSnapshot } from './snapshotMerge';
import type { DeviceSyncSnapshot, SyncLocalState, SyncStateStore } from './syncTypes';

const SNAPSHOT_STORAGE_KEY = 'google-drive-sync-state';
const LOCAL_STATE_STORAGE_KEY = 'google-drive-sync-local-state';

interface BrowserStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  remove(keys: string | string[]): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class BrowserSyncStateStore implements SyncStateStore {
  constructor(private readonly storage: BrowserStorageArea = browser.storage.local) {}

  async clear() {
    await this.storage.remove([SNAPSHOT_STORAGE_KEY, LOCAL_STATE_STORAGE_KEY]);
  }

  async get() {
    const stored = (await this.storage.get(SNAPSHOT_STORAGE_KEY))[SNAPSHOT_STORAGE_KEY];
    if (!isSnapshot(stored)) return undefined;
    return migrateSnapshot(stored, stored.deviceId, stored.generatedAt);
  }

  async put(snapshot: DeviceSyncSnapshot) {
    await this.storage.set({ [SNAPSHOT_STORAGE_KEY]: snapshot });
  }

  async getLocalState() {
    const stored = (await this.storage.get(LOCAL_STATE_STORAGE_KEY))[LOCAL_STATE_STORAGE_KEY];
    return isLocalState(stored) ? stored : undefined;
  }

  async putLocalState(state: SyncLocalState) {
    await this.storage.set({ [LOCAL_STATE_STORAGE_KEY]: state });
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

function isLocalState(value: unknown): value is SyncLocalState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SyncLocalState>;
  return state.formatVersion === 1 && Boolean(state.remoteSnapshots) && typeof state.remoteSnapshots === 'object';
}