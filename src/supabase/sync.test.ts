import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../db/database';
import { syncUserData } from './sync';

const supabaseState = vi.hoisted(() => ({
  acknowledgedRows: new Map<string, Array<Record<string, unknown>>>(),
  acknowledgedTables: [] as string[],
  remoteRows: new Map<string, Array<Record<string, unknown>>>(),
  rpcError: null as Record<string, unknown> | null,
  rpcCalls: 0,
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
    rpc: () => {
      supabaseState.rpcCalls += 1;
      return Promise.resolve({ data: supabaseState.rpcUsage, error: supabaseState.rpcError });
    },
  }),
}));

describe('syncUserData invalidation result', () => {
  const databaseName = 'mochi-note-sync-result-test';
  let database: MochiDatabase;

  beforeEach(async () => {
    supabaseState.acknowledgedRows.clear();
    supabaseState.acknowledgedTables.length = 0;
    supabaseState.remoteRows.clear();
    supabaseState.rpcError = null;
    supabaseState.rpcCalls = 0;
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

  it('reuses fresh cloud storage usage without another RPC during normal text sync', async () => {
    await syncUserData(database, 'user-a', 'local-device', undefined, { pullScope: 'pending' });
    await syncUserData(database, 'user-a', 'local-device', undefined, { pullScope: 'pending' });

    expect(supabaseState.rpcCalls).toBe(1);
  });

  it('adds newly pushed text to the cached usage estimate', async () => {
    await database.put('syncOutbox', {
      clientUpdatedAt: '2026-07-23T00:00:00.000Z',
      deviceId: 'local-device',
      entityId: 'note-estimated-usage',
      entityType: 'note',
      id: 'note:note-estimated-usage',
      nextAttemptAt: null,
      operation: 'upsert',
      payload: {
        content: 'x'.repeat(1_024),
        id: 'note-estimated-usage',
        updatedAt: '2026-07-23T00:00:00.000Z',
      },
      retryCount: 0,
    });

    await syncUserData(database, 'user-a', 'local-device', undefined, { pullScope: 'pending' });

    await expect(database.get('syncMetadata', 'cloud-storage-usage')).resolves.toMatchObject({
      usage: { usedBytes: expect.any(Number) },
    });
    const cache = await database.get('syncMetadata', 'cloud-storage-usage');
    expect(cache?.usage.usedBytes).toBeGreaterThan(0);
  });

  it('rechecks cloud storage when pending text projects usage to 95% of the limit', async () => {
    await database.put('syncMetadata', {
      checkedAt: new Date().toISOString(),
      id: 'cloud-storage-usage',
      usage: {
        limitBytes: 5_242_880,
        planCode: 'free',
        status: 'ok',
        usedBytes: 4_970_000,
      },
    });
    await database.put('syncOutbox', {
      clientUpdatedAt: '2026-07-23T00:00:00.000Z',
      deviceId: 'local-device',
      entityId: 'note-near-limit',
      entityType: 'note',
      id: 'note:note-near-limit',
      nextAttemptAt: null,
      operation: 'upsert',
      payload: {
        content: 'x'.repeat(20_000),
        id: 'note-near-limit',
        updatedAt: '2026-07-23T00:00:00.000Z',
      },
      retryCount: 0,
    });

    await syncUserData(database, 'user-a', 'local-device', undefined, { pullScope: 'pending' });

    expect(supabaseState.rpcCalls).toBe(1);
  });

  it('refreshes cloud storage after the twelve-hour cache lifetime', async () => {
    await database.put('syncMetadata', {
      checkedAt: new Date(Date.now() - (12 * 60 * 60 * 1_000) - 1).toISOString(),
      id: 'cloud-storage-usage',
      usage: {
        limitBytes: 5_242_880,
        planCode: 'free',
        status: 'ok',
        usedBytes: 1_024,
      },
    });

    await syncUserData(database, 'user-a', 'local-device', undefined, { pullScope: 'pending' });

    expect(supabaseState.rpcCalls).toBe(1);
  });

  it('applies a remote batch for one entity type before advancing its cursor', async () => {
    supabaseState.remoteRows.set('notes', [
      {
        archived_at: null,
        client_updated_at: '2026-07-22T00:00:00.000Z',
        color: 'sage',
        content: {},
        created_at: '2026-07-22T00:00:00.000Z',
        deleted_at: null,
        device_id: 'remote-device',
        favorite: false,
        folder_id: null,
        id: 'remote-note-a',
        pattern: 'plain',
        pinned: false,
        plain_text: 'First remote note',
        source: null,
        sync_version: 1,
        tags: [],
        title: 'First',
        trashed_at: null,
        updated_at: '2026-07-22T00:00:00.000Z',
        user_id: 'user-a',
      },
      {
        archived_at: null,
        client_updated_at: '2026-07-22T00:01:00.000Z',
        color: 'blue',
        content: {},
        created_at: '2026-07-22T00:01:00.000Z',
        deleted_at: null,
        device_id: 'remote-device',
        favorite: false,
        folder_id: null,
        id: 'remote-note-b',
        pattern: 'plain',
        pinned: false,
        plain_text: 'Second remote note',
        source: null,
        sync_version: 2,
        tags: [],
        title: 'Second',
        trashed_at: null,
        updated_at: '2026-07-22T00:01:00.000Z',
        user_id: 'user-a',
      },
    ]);

    await syncUserData(database, 'user-a', 'local-device');

    await expect(database.getAll('notes')).resolves.toHaveLength(2);
    await expect(database.get('syncCursors', 'note')).resolves.toMatchObject({ version: 2 });
  });

  it('continues sync when the hosted project has not deployed the quota usage RPC yet', async () => {
    supabaseState.rpcError = {
      code: 'PGRST202',
      details: 'Searched for the function public.get_cloud_storage_usage without parameters, but no matches were found in the schema cache.',
      message: 'Could not find the function public.get_cloud_storage_usage without parameters in the schema cache',
    };

    const result = await syncUserData(
      database,
      'user-a',
      'local-device',
      undefined,
      { pullScope: 'pending' },
    );

    expect(result.status).toBe('idle');
    expect(result.cloudStorage).toBeNull();
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
    expect(supabaseState.rpcCalls).toBe(2);
    expect(result.pendingCount).toBe(1);
    await expect(database.get('syncOutbox', 'note:note-a')).resolves.toMatchObject({
      blockedReason: 'quota',
      nextAttemptAt: null,
      payload: { title: 'Very large note' },
    });
  });
});
