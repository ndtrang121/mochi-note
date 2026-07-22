import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../db/database';
import { createSyncedMochiRepositories } from '../db/repositories';

describe('Supabase sync outbox', () => {
  let database: MochiDatabase;
  const databaseName = 'mochi-note-outbox-test';

  beforeEach(async () => {
    database = await openMochiDatabase(databaseName);
  });

  afterEach(async () => {
    database.close();
    await deleteMochiDatabase(databaseName);
  });

  it('commits a local write and its outbox item in one transaction', async () => {
    const repositories = createSyncedMochiRepositories(database, { deviceId: 'device-a' });
    const timestamp = '2026-07-22T00:00:00.000Z';

    await repositories.folders.put({
      color: 'sage',
      createdAt: timestamp,
      icon: 'folder',
      id: 'folder-a',
      name: 'A',
      parentId: null,
      position: 0,
      updatedAt: timestamp,
    });

    await expect(database.get('folders', 'folder-a')).resolves.toMatchObject({ name: 'A' });
    await expect(database.get('syncOutbox', 'folder:folder-a')).resolves.toMatchObject({
      deviceId: 'device-a',
      operation: 'upsert',
    });
  });

  it('replaces an upsert with a tombstone when the entity is deleted', async () => {
    const repositories = createSyncedMochiRepositories(database, { deviceId: 'device-a' });
    const timestamp = '2026-07-22T00:00:00.000Z';

    await repositories.folders.put({
      color: 'sage',
      createdAt: timestamp,
      icon: 'folder',
      id: 'folder-a',
      name: 'A',
      parentId: null,
      position: 0,
      updatedAt: timestamp,
    });
    await repositories.folders.delete('folder-a');

    await expect(database.get('folders', 'folder-a')).resolves.toBeUndefined();
    await expect(database.get('syncOutbox', 'folder:folder-a')).resolves.toMatchObject({
      operation: 'delete',
      payload: { id: 'folder-a' },
    });
  });
});

