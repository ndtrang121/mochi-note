import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { migrateSnapshot, type LegacyDeviceSyncSnapshot } from './snapshotMerge';
import type { DeviceSyncSnapshot, SyncLocalState, SyncStateStore } from './syncTypes';

const DEFAULT_DATABASE_NAME = 'mochi-note-sync-cache';
const STORE_NAME = 'sync-state';
const SNAPSHOT_KEY = 'snapshot';
const LOCAL_STATE_KEY = 'local-state';

interface SyncCacheSchema extends DBSchema {
  'sync-state': {
    key: string;
    value: unknown;
  };
}

export class IndexedDbSyncStateStore implements SyncStateStore {
  private databasePromise: Promise<IDBPDatabase<SyncCacheSchema>> | null = null;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  async clear() {
    const database = await this.database();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await Promise.all([
      transaction.store.delete(SNAPSHOT_KEY),
      transaction.store.delete(LOCAL_STATE_KEY),
    ]);
    await transaction.done;
  }

  async get() {
    const stored = await (await this.database()).get(STORE_NAME, SNAPSHOT_KEY);
    if (!isSnapshot(stored)) return undefined;
    return migrateSnapshot(stored, stored.deviceId, stored.generatedAt);
  }

  async put(snapshot: DeviceSyncSnapshot) {
    await (await this.database()).put(STORE_NAME, snapshot, SNAPSHOT_KEY);
  }

  async getLocalState() {
    const stored = await (await this.database()).get(STORE_NAME, LOCAL_STATE_KEY);
    return isLocalState(stored) ? stored : undefined;
  }

  async putLocalState(state: SyncLocalState) {
    await (await this.database()).put(STORE_NAME, state, LOCAL_STATE_KEY);
  }

  async close() {
    const databasePromise = this.databasePromise;
    this.databasePromise = null;
    (await databasePromise)?.close();
  }

  private database() {
    this.databasePromise ??= openDB<SyncCacheSchema>(this.databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      },
    });
    return this.databasePromise;
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