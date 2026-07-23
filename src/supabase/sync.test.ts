import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../db/database';
import { syncUserData } from './sync';

const supabaseState = vi.hoisted(() => ({
  acknowledgedRows: new Map<string, Array<Record<string, unknown>>>(),
  acknowledgedTables: [] as string[],
  remoteRows: new Map<string, Array<Record<string, unknown>>>(),
  rpcUsage: {
    limitBytes: 5_242_880,
    planCode: 'free',
    status: 'ok',
    usedBytes: 0,
  },
  selectedTables: [] as string[],
  upsertError: null as { message: string } | null,
  upsertedTables: [] as string[],
}));

vi.mock('./client', () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      const query = {
        gt: () => query,
        limit: () => Promise.resolve({ data: supabaseState.remoteRows.get(table) ?? [], error: null }),
        order: () => query,
      };
      return {
        select: () => {
          supabaseState.selectedTables.push(table);
          return query;
        },
        upsert: () => {
          supabaseState.upsertedTables.push(table);
          return {
            select: () => {
              supabaseState.acknowledgedTables.push(table);
              if (supabaseState.upsertError) {
                return Promise.resolve({
                  data: null,
                  error: supabaseState.upsertError,
                });
              }
              return Promise.resolve({
                data: supabaseState.acknowledgedRows.get(table) ?? [],
                error: null,
              });
            },
          };
        },
      };
    },
    rpc: () => Promise.resolve({ data: supabaseState.rpcUsage, error: null }),
  }),
}));

describe('syncUserData invalidation result', () => {
  const databaseName = 'mochi-note-sync-result-test';
  let database: MochiDatabase;

  beforeEach(async () => {
    supabaseState.acknowledgedRows.clear();
    supabaseState.acknowledgedTables.length = 0;
    supabaseState.remoteRows.clear();
    supabaseState.rpcUsage = {
      limitBytes: 5_242_880,
      planCode: 'free',
      status: 'ok',
      usedBytes: 0,
    };
    supabaseState.selectedTables.length = 0;
    supabaseState.upsertError = null;
    supabaseState.upsertedTables.length = 0;
    database = await openMochiDatabase(databaseName);
  });

  afterEach(async () => {
    database.close();
    await deleteMochiDatabase(databaseName);
  });

  it('returns the entity types written to IndexedDB by pull', async () => {
    supabaseState.remoteRows.set('folders', [{
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

  it('acknowledges a mutation in its upsert request without a standalone pull', async () => {
    const timestamp = '2026-07-22T01:00:00.000Z';
    await database.put('syncOutbox', {
      clientUpdatedAt: timestamp,
      deviceId: 'local-device',
      entityId: 'note-a',
      entityType: 'note',
      id: 'note:note-a',
      nextAttemptAt: null,
      operation: 'upsert',
      payload: { id: 'note-a', title: 'Changed note', updatedAt: timestamp },
      retryCount: 0,
    });

    const result = await syncUserData(
      database,
      'user-a',
      'local-device',
      undefined,
      { pullScope: 'pending' },
    );

    expect(supabaseState.upsertedTables).toEqual(['notes']);
    expect(supabaseState.acknowledgedTables).toEqual(['notes']);
    expect(supabaseState.selectedTables).toEqual([]);
    expect(result.pendingCount).toBe(0);
  });

  it('does not pull unrelated tables when a mutation cycle has no eligible outbox work', async () => {
    await syncUserData(
      database,
      'user-a',
      'local-device',
      undefined,
      { pullScope: 'pending' },
    );

    expect(supabaseState.selectedTables).toEqual([]);
  });

  it('marks quota-blocked mutations without deleting local outbox data or retrying immediately', async () => {
    const timestamp = '2026-07-22T01:00:00.000Z';
    supabaseState.rpcUsage = {
      limitBytes: 5_242_880,
      planCode: 'free',
      status: 'full',
      usedBytes: 5_242_880,
    };
    supabaseState.upsertError = { message: 'STORAGE_QUOTA_EXCEEDED' };
    await database.put('syncOutbox', {
      clientUpdatedAt: timestamp,
      deviceId: 'local-device',
      entityId: 'note-a',
      entityType: 'note',
      id: 'note:note-a',
      nextAttemptAt: null,
      operation: 'upsert',
      payload: { id: 'note-a', title: 'Very large note', updatedAt: timestamp },
      retryCount: 0,
    });

    const result = await syncUserData(
      database,
      'user-a',
      'local-device',
      undefined,
      { pullScope: 'pending' },
    );

    expect(result.status).toBe('blocked_quota');
    expect(result.pendingCount).toBe(1);
    await expect(database.get('syncOutbox', 'note:note-a')).resolves.toMatchObject({
      blockedReason: 'quota',
      nextAttemptAt: null,
      payload: { title: 'Very large note' },
    });
  });
});
