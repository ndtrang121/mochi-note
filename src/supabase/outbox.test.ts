import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../db/database';
import { createSyncedMochiRepositories } from '../db/repositories';
import { listPendingOutbox, removeOutboxItem, unblockQuotaOutbox } from './outbox';

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

  it('keeps a newer mutation that arrives while an older request is in flight', async () => {
    const timestamp = '2026-07-22T00:00:00.000Z';
    const completedItem = {
      clientUpdatedAt: timestamp,
      deviceId: 'device-a',
      entityId: 'note-a',
      entityType: 'note' as const,
      id: 'note:note-a',
      nextAttemptAt: null,
      operation: 'upsert' as const,
      payload: { id: 'note-a', plainText: 'old', updatedAt: timestamp },
      retryCount: 0,
    };
    await database.put('syncOutbox', {
      ...completedItem,
      payload: { id: 'note-a', plainText: 'new', updatedAt: timestamp },
    });

    await removeOutboxItem(database, completedItem);

    await expect(database.get('syncOutbox', completedItem.id)).resolves.toMatchObject({
      payload: { plainText: 'new' },
    });
  });

  it('pauses quota-blocked upserts while allowing deletes to sync', async () => {
    const timestamp = '2026-07-22T00:00:00.000Z';
    await database.put('syncOutbox', {
      blockedReason: 'quota',
      clientUpdatedAt: timestamp,
      deviceId: 'device-a',
      entityId: 'note-a',
      entityType: 'note',
      id: 'note:note-a',
      nextAttemptAt: null,
      operation: 'upsert',
      payload: { id: 'note-a', title: 'Large note', updatedAt: timestamp },
      retryCount: 0,
    });
    await database.put('syncOutbox', {
      blockedReason: 'quota',
      clientUpdatedAt: timestamp,
      deviceId: 'device-a',
      entityId: 'note-b',
      entityType: 'note',
      id: 'note:note-b',
      nextAttemptAt: null,
      operation: 'delete',
      payload: { id: 'note-b', updatedAt: timestamp },
      retryCount: 0,
    });

    await expect(listPendingOutbox(database)).resolves.toMatchObject([
      { entityId: 'note-b', operation: 'delete' },
    ]);

    await expect(unblockQuotaOutbox(database)).resolves.toBe(2);
    await expect(listPendingOutbox(database)).resolves.toHaveLength(2);
  });
});
