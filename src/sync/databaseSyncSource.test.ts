import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../db/database';
import { createMochiRepositories } from '../db/repositories';
import { seedDatabase } from '../db/seed';
import { MochiDatabaseSyncDataSource } from './databaseSyncSource';
import { sha256Hex } from './syncCrypto';
import type { SyncEntityRecord } from './syncTypes';

let sourceDatabase: MochiDatabase;
let targetDatabase: MochiDatabase;
let sourceName: string;
let targetName: string;
let databaseCounter = 0;


beforeEach(async () => {
  databaseCounter += 1;
  sourceName = `sync-source-${databaseCounter}`;
  targetName = `sync-target-${databaseCounter}`;
  sourceDatabase = await openMochiDatabase(sourceName);
  targetDatabase = await openMochiDatabase(targetName);
  await seedDatabase(sourceDatabase);
});

afterEach(async () => {
  sourceDatabase.close();
  targetDatabase.close();
  await Promise.all([deleteMochiDatabase(sourceName), deleteMochiDatabase(targetName)]);
});

describe('IndexedDB sync data source', () => {
  it('restores attachment records from one content-addressed blob', async () => {
    const bytes = new Uint8Array([0, 17, 128, 255]);
    const timestamp = '2026-07-20T04:00:00.000Z';
    const source = new MochiDatabaseSyncDataSource(sourceDatabase);
    const dataset = await source.read();
    const blobHash = await sha256Hex(bytes);
    dataset.blobs.set(blobHash, bytes);
    for (const id of ['attachment-a', 'attachment-b']) {
      dataset.entities.push({
        entityType: 'attachment',
        id,
        value: {
          blobHash,
          createdAt: timestamp,
          fileName: `${id}.bin`,
          id,
          kind: 'file',
          mimeType: 'application/octet-stream',
          noteId: 'note-month-plan',
          size: bytes.byteLength,
          updatedAt: timestamp,
        },
      });
    }

    expect(dataset.entities.filter(({ entityType }) => entityType === 'attachment')).toHaveLength(2);
    expect(dataset.blobs.size).toBe(1);

    const records: SyncEntityRecord[] = dataset.entities.map((item) => ({
      clock: { wallTimeMs: Date.parse(timestamp), counter: 0, deviceId: 'device-source' },
      contentHash: '',
      deleted: false,
      entityType: item.entityType,
      id: item.id,
      modifiedAt: timestamp,
      originDeviceId: 'device-source',
      value: item.value,
      version: { 'device-source': 1 },
    }));
    const target = new MochiDatabaseSyncDataSource(targetDatabase);
    await target.replace(records, (hash) => {
      const blob = dataset.blobs.get(hash);
      if (!blob) throw new Error(`Missing test blob ${hash}`);
      return Promise.resolve(blob);
    });

    const restored = await createMochiRepositories(targetDatabase).attachments.list();
    expect(restored.map(({ id }) => id).sort()).toEqual(['attachment-a', 'attachment-b']);
    expect(restored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'attachment-a', size: bytes.byteLength }),
        expect.objectContaining({ id: 'attachment-b', size: bytes.byteLength }),
      ]),
    );
  });

  it('clears domain stores without closing the active IndexedDB connection', async () => {
    const source = new MochiDatabaseSyncDataSource(sourceDatabase);

    await source.clear();

    await expect(sourceDatabase.count('notes')).resolves.toBe(0);
    await expect(sourceDatabase.count('tasks')).resolves.toBe(0);
    await expect(sourceDatabase.count('settings')).resolves.toBe(1);
  });
});