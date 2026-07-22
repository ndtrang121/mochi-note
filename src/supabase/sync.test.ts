import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../db/database';
import { syncUserData } from './sync';

const remoteRows = vi.hoisted(() => new Map<string, Array<Record<string, unknown>>>());

vi.mock('./client', () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      const query = {
        gt: () => query,
        limit: () => Promise.resolve({ data: remoteRows.get(table) ?? [], error: null }),
        order: () => query,
      };
      return { select: () => query };
    },
  }),
}));

describe('syncUserData invalidation result', () => {
  const databaseName = 'mochi-note-sync-result-test';
  let database: MochiDatabase;

  beforeEach(async () => {
    remoteRows.clear();
    database = await openMochiDatabase(databaseName);
  });

  afterEach(async () => {
    database.close();
    await deleteMochiDatabase(databaseName);
  });

  it('returns the entity types written to IndexedDB by pull', async () => {
    remoteRows.set('folders', [{
      client_updated_at: '2026-07-22T00:00:00.000Z',
      color: 'sage',
      created_at: '2026-07-22T00:00:00.000Z',
      deleted_at: null,
      device_id: 'remote-device',
      icon: 'folder',
      id: 'remote-folder',
      name: 'Remote folder',
      parent_id: null,
      position: 0,
      sync_version: 1,
      updated_at: '2026-07-22T00:00:00.000Z',
      user_id: 'user-a',
    }]);

    const result = await syncUserData(database, 'user-a', 'local-device');

    expect(result.changedEntityTypes).toEqual(['folder']);
    await expect(database.get('folders', 'remote-folder')).resolves.toMatchObject({
      name: 'Remote folder',
    });
  });
});
