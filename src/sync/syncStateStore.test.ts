import 'fake-indexeddb/auto';

import { deleteDB, openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';

import { IndexedDbSyncStateStore } from './syncStateStore';
import type { DeviceSyncSnapshot, SyncLocalState } from './syncTypes';

let counter = 0;
let databaseName = '';
let store: IndexedDbSyncStateStore | undefined;

function snapshot(): DeviceSyncSnapshot {
  return {
    clock: { counter: 0, deviceId: 'device-a', wallTimeMs: 100 },
    deviceId: 'device-a',
    formatVersion: 2,
    generatedAt: '2026-07-20T00:00:00.000Z',
    records: [],
    revisions: [],
  };
}

afterEach(async () => {
  await store?.close();
  if (databaseName) await deleteDB(databaseName);
});

describe('IndexedDB sync state store', () => {
  it('persists snapshot, remote cache, and dataset hashes together', async () => {
    databaseName = `sync-cache-${++counter}`;
    store = new IndexedDbSyncStateStore(databaseName);
    const localState: SyncLocalState = {
      formatVersion: 1,
      lastDatasetHash: 'dataset-hash',
      lastSnapshotHash: 'snapshot-hash',
      remoteSnapshots: {},
    };

    await store.put(snapshot());
    await store.putLocalState(localState);

    await expect(store.get()).resolves.toEqual(snapshot());
    await expect(store.getLocalState()).resolves.toEqual(localState);
    await store.clear();
    await expect(store.get()).resolves.toBeUndefined();
    await expect(store.getLocalState()).resolves.toBeUndefined();
  });

  it('migrates a legacy v1 snapshot when reading existing IndexedDB state', async () => {
    databaseName = `sync-cache-${++counter}`;
    const database = await openDB(databaseName, 1, {
      upgrade(value) { value.createObjectStore('sync-state'); },
    });
    await database.put('sync-state', {
      deviceId: 'legacy-device',
      formatVersion: 1,
      generatedAt: '2026-07-20T00:00:00.000Z',
      records: [],
    }, 'snapshot');
    database.close();
    store = new IndexedDbSyncStateStore(databaseName);

    await expect(store.get()).resolves.toMatchObject({ deviceId: 'legacy-device', formatVersion: 2, revisions: [] });
  });
});