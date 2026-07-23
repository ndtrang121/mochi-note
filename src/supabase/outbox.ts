import type { StoreNames } from 'idb';

import type { MochiDatabase } from '../db/database';
import type { MochiDatabaseSchema } from '../db/migrations';
import { createSupabaseSyncRequestMessage } from './messages';
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
  void requestSupabaseBackgroundSync([entityType]);
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
  void requestSupabaseBackgroundSync([entityType]);
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
    .filter((item) => (item.operation === 'delete' || item.blockedReason !== 'quota')
      && (!item.nextAttemptAt || item.nextAttemptAt <= new Date().toISOString()))
    .sort((first, second) => first.clientUpdatedAt.localeCompare(second.clientUpdatedAt));
}

export async function countOutboxItems(database: MochiDatabase) {
  return database.count('syncOutbox');
}

export async function blockOutboxForQuota(
  database: MochiDatabase,
  items: SyncOutboxItem[],
  error: unknown,
) {
  const transaction = database.transaction('syncOutbox', 'readwrite');
  await Promise.all(items.map(async (item) => {
    if (item.operation === 'delete') return;
    const currentItem = await transaction.store.get(item.id);
    if (isSameOutboxMutation(currentItem, item)) {
      await transaction.store.put({
        ...item,
        blockedReason: 'quota',
        lastError: error instanceof Error ? error.message : String(error),
        nextAttemptAt: null,
      });
    }
  }));
  await transaction.done;
}

export async function unblockQuotaOutbox(database: MochiDatabase) {
  const transaction = database.transaction('syncOutbox', 'readwrite');
  const items = await transaction.store.getAll();
  let count = 0;
  await Promise.all(items.map(async (item) => {
    if (item.blockedReason !== 'quota') return;
    count += 1;
    const { blockedReason: _blockedReason, lastError: _lastError, ...nextItem } = item;
    await transaction.store.put({
      ...nextItem,
      nextAttemptAt: null,
      retryCount: 0,
    });
  }));
  await transaction.done;
  return count;
}

function isSameOutboxMutation(
  currentItem: SyncOutboxItem | undefined,
  completedItem: SyncOutboxItem,
) {
  return currentItem?.clientUpdatedAt === completedItem.clientUpdatedAt
    && currentItem.deviceId === completedItem.deviceId
    && currentItem.operation === completedItem.operation
    && JSON.stringify(currentItem.payload) === JSON.stringify(completedItem.payload);
}

export async function removeOutboxItem(database: MochiDatabase, item: SyncOutboxItem) {
  const transaction = database.transaction('syncOutbox', 'readwrite');
  const currentItem = await transaction.store.get(item.id);
  // Preserve a newer mutation that reused the same entity outbox key while this request was in flight.
  if (isSameOutboxMutation(currentItem, item)) await transaction.store.delete(item.id);
  await transaction.done;
}

export async function saveOutboxRetry(
  database: MochiDatabase,
  item: SyncOutboxItem,
  error: unknown,
) {
  const retryCount = item.retryCount + 1;
  const delayMs = Math.min(15 * 60_000, 1_000 * (2 ** Math.min(retryCount, 10)));
  const nextAttemptAt = new Date(Date.now() + delayMs + Math.round(Math.random() * 500)).toISOString();
  const transaction = database.transaction('syncOutbox', 'readwrite');
  const currentItem = await transaction.store.get(item.id);
  // A failed stale request must not overwrite a newer local mutation with its retry metadata.
  if (isSameOutboxMutation(currentItem, item)) {
    await transaction.store.put({
      ...item,
      nextAttemptAt,
      retryCount,
      lastError: error instanceof Error ? error.message : String(error),
    } as SyncOutboxItem & { lastError: string });
  }
  await transaction.done;
}

export async function readSyncCursor(database: MochiDatabase, entityType: SyncEntityType) {
  return (await database.get('syncCursors', entityType))?.version ?? 0;
}

export function writeSyncCursor(database: MochiDatabase, entityType: SyncEntityType, version: number) {
  return database.put('syncCursors', { entityType, version });
}
export async function requestSupabaseBackgroundSync(entityTypes?: SyncEntityType[]) {
  const runtime = (globalThis as typeof globalThis & {
    browser?: { runtime?: { sendMessage?: (message: unknown) => Promise<unknown> } };
  }).browser?.runtime;
  if (!runtime?.sendMessage) return;
  try {
    await runtime.sendMessage(createSupabaseSyncRequestMessage(entityTypes));
  } catch {
    // The popup may close before the background worker is reachable; the alarm retries later.
  }
}
