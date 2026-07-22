import type { StoreNames } from 'idb';

import type { MochiDatabase } from '../db/database';
import type { MochiDatabaseSchema } from '../db/migrations';
import type { SyncEntityType, SyncOutboxItem } from './types';

export interface SyncMutationContext {
  deviceId: string;
  onMutation?: () => void;
}

type CoreStore = Exclude<StoreNames<MochiDatabaseSchema>, 'attachments' | 'syncCursors' | 'syncOutbox'>;

export async function putWithOutbox<TEntity extends { id: string; updatedAt: string }>(
  database: MochiDatabase,
  storeName: CoreStore,
  entityType: SyncEntityType,
  entity: TEntity,
  context: SyncMutationContext,
) {
  const transaction = database.transaction([storeName, 'syncOutbox'], 'readwrite');
  await transaction.objectStore(storeName).put(entity as never);
  await transaction.objectStore('syncOutbox').put(outboxItem(entityType, entity.id, entity, context));
  await transaction.done;
  context.onMutation?.();
  void requestBackgroundSync();
}

export async function deleteWithOutbox(
  database: MochiDatabase,
  storeName: CoreStore,
  entityType: SyncEntityType,
  entityId: string,
  context: SyncMutationContext,
) {
  const transaction = database.transaction([storeName, 'syncOutbox'], 'readwrite');
  const existing = await transaction.objectStore(storeName).get(entityId) as ({ id: string; updatedAt?: string } | undefined);
  await transaction.objectStore(storeName).delete(entityId);
  await transaction.objectStore('syncOutbox').put(outboxItem(
    entityType,
    entityId,
    existing ? { ...existing, deletedAt: new Date().toISOString() } : null,
    context,
    'delete',
  ));
  await transaction.done;
  context.onMutation?.();
  void requestBackgroundSync();
}

export function outboxItem(
  entityType: SyncEntityType,
  entityId: string,
  payload: Record<string, unknown> | null,
  context: SyncMutationContext,
  operation: SyncOutboxItem['operation'] = 'upsert',
): SyncOutboxItem {
  const clientUpdatedAt = typeof payload?.updatedAt === 'string'
    ? payload.updatedAt
    : new Date().toISOString();
  return {
    clientUpdatedAt,
    deviceId: context.deviceId,
    entityId,
    entityType,
    id: `${entityType}:${entityId}`,
    nextAttemptAt: null,
    operation,
    payload,
    retryCount: 0,
  };
}

export async function listPendingOutbox(database: MochiDatabase) {
  return (await database.getAll('syncOutbox'))
    .filter((item) => !item.nextAttemptAt || item.nextAttemptAt <= new Date().toISOString())
    .sort((first, second) => first.clientUpdatedAt.localeCompare(second.clientUpdatedAt));
}

export function removeOutboxItem(database: MochiDatabase, id: string) {
  return database.delete('syncOutbox', id);
}

export function saveOutboxRetry(database: MochiDatabase, item: SyncOutboxItem, error: unknown) {
  const retryCount = item.retryCount + 1;
  const delayMs = Math.min(15 * 60_000, 1_000 * (2 ** Math.min(retryCount, 10)));
  const nextAttemptAt = new Date(Date.now() + delayMs + Math.round(Math.random() * 500)).toISOString();
  return database.put('syncOutbox', {
    ...item,
    nextAttemptAt,
    retryCount,
    lastError: error instanceof Error ? error.message : String(error),
  } as SyncOutboxItem & { lastError: string });
}

export async function readSyncCursor(database: MochiDatabase, entityType: SyncEntityType) {
  return (await database.get('syncCursors', entityType))?.version ?? 0;
}

export function writeSyncCursor(database: MochiDatabase, entityType: SyncEntityType, version: number) {
  return database.put('syncCursors', { entityType, version });
}
async function requestBackgroundSync() {
  const runtime = (globalThis as typeof globalThis & {
    browser?: { runtime?: { sendMessage?: (message: unknown) => Promise<unknown> } };
  }).browser?.runtime;
  if (!runtime?.sendMessage) return;
  try {
    await runtime.sendMessage({ type: 'MOCHI_SUPABASE_SYNC_REQUEST' });
  } catch {
    // The popup may close before the background worker is reachable; the alarm retries later.
  }
}

