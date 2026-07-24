import type { SupabaseClient } from '@supabase/supabase-js';

import type { MochiDatabase } from '../db/database';
import { MOCHI_DATABASE_VERSION } from '../db/migrations';
import { createMochiRepositories } from '../db/repositories';
import type { Folder, Note, Reminder, Settings, Task } from '../db/models';
import { getSupabaseClient } from './client';
import {
  blockOutboxForQuota,
  countOutboxItems,
  listPendingOutbox,
  readSyncCursor,
  removeOutboxItem,
  saveOutboxRetry,
  unblockQuotaOutbox,
  writeSyncCursor,
} from './outbox';
import type { CloudStorageUsage, CloudStorageUsageCache, SyncEntityType, SyncOutboxItem, SyncResult, SyncState } from './types';

const TABLES: Record<SyncEntityType, string> = {
  folder: 'folders',
  note: 'notes',
  reminder: 'reminders',
  settings: 'app_settings',
  task: 'tasks',
};

const CLOUD_STORAGE_CACHE_ID = 'cloud-storage-usage';
const CLOUD_STORAGE_CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const CLOUD_STORAGE_RECHECK_RATIO = 0.95;

export interface SyncUserDataOptions {
  pullScope?: 'all' | 'pending';
}

const INITIAL_SYNC_STATE: SyncState = {
  cloudStorage: null,
  error: null,
  lastSyncedAt: null,
  pendingCount: 0,
  status: 'idle',
};

export async function syncUserData(
  database: MochiDatabase,
  userId: string,
  _deviceId: string,
  onState?: (state: SyncState) => void,
  options?: SyncUserDataOptions,
): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) return { ...INITIAL_SYNC_STATE, changedEntityTypes: [], status: 'offline' };
  const pending = await listPendingOutbox(database);
  const cachedCloudStorage = await database.get('syncMetadata', CLOUD_STORAGE_CACHE_ID);
  const shouldRefreshStorageUsage = shouldRefreshCloudStorageUsage(cachedCloudStorage, pending);
  const cloudStorageCheckedAt = shouldRefreshStorageUsage
    ? new Date().toISOString()
    : cachedCloudStorage?.checkedAt;
  let cloudStorage = shouldRefreshStorageUsage
    ? await readCloudStorageUsage(client)
    : cachedCloudStorage?.usage ?? null;
  if (shouldRefreshStorageUsage && cloudStorage) {
    await writeCloudStorageUsageCache(database, cloudStorage, cloudStorageCheckedAt);
  }
  if (cloudStorage && (cloudStorage.status === 'ok' || cloudStorage.status === 'warning' || cloudStorage.status === 'unlimited')) {
    await unblockQuotaOutbox(database);
  }
  onState?.({ ...INITIAL_SYNC_STATE, cloudStorage, pendingCount: await countOutboxItems(database), status: 'syncing' });

  try {
    const acknowledgedEntityTypes = await pushOutbox(client, database, userId, pending);
    const pulledEntityTypes = options?.pullScope === 'pending'
      ? []
      : await pullChanges(client, database, Object.keys(TABLES) as SyncEntityType[]);
    const changedEntityTypes = [...new Set([
      ...acknowledgedEntityTypes,
      ...pulledEntityTypes,
    ])];
    if (cloudStorage) {
      const estimatedUsage = estimateCloudStorageUsageAfterPush(cloudStorage, pending);
      if (estimatedUsage !== cloudStorage) {
        cloudStorage = estimatedUsage;
        await writeCloudStorageUsageCache(database, estimatedUsage, cloudStorageCheckedAt);
      }
    }
    const synced: SyncState = {
      cloudStorage,
      error: null,
      lastSyncedAt: new Date().toISOString(),
      pendingCount: await countOutboxItems(database),
      status: 'idle',
    };
    onState?.(synced);
    return { ...synced, changedEntityTypes };
  } catch (error) {
    const quotaBlocked = isStorageQuotaError(error);
    const failed: SyncState = {
      cloudStorage: quotaBlocked
        ? await refreshCloudStorageUsageAfterQuotaError(client, database, cloudStorage)
        : cloudStorage,
      error: error instanceof Error ? error.message : String(error),
      lastSyncedAt: null,
      pendingCount: await countOutboxItems(database),
      status: quotaBlocked ? 'blocked_quota' : typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
    };
    onState?.(failed);
    return { ...failed, changedEntityTypes: [] };
  }
}

async function pushOutbox(
  client: SupabaseClient,
  database: MochiDatabase,
  userId: string,
  pending: SyncOutboxItem[],
) {
  const grouped = Map.groupBy(pending, (item) => item.entityType);
  const repositories = createMochiRepositories(database);
  const changedEntityTypes = new Set<SyncEntityType>();
  for (const [entityType, items] of grouped) {
    const deleteItems = items.filter((item) => item.operation === 'delete');
    const upsertItems = items.filter((item) => item.operation !== 'delete');
    const orderedBatches = [deleteItems, upsertItems].filter((batch) => batch.length > 0);
    for (const batch of orderedBatches) {
    try {
      const rows = batch.map((item) => toRemoteRow(item, userId));
      const { data, error } = await client
        .from(TABLES[entityType])
        .upsert(rows as never, { onConflict: 'user_id,id' })
        .select('*');
      if (error) throw error;
      const acknowledgedRows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      if (acknowledgedRows.length > 0) changedEntityTypes.add(entityType);
      await applyRemoteRows(entityType, acknowledgedRows, repositories);
      await Promise.all(batch.map((item) => removeOutboxItem(database, item)));
    } catch (error) {
      if (isStorageQuotaError(error)) {
        await blockOutboxForQuota(database, batch, error);
      } else {
        await Promise.all(batch.map((item) => saveOutboxRetry(database, item, error)));
      }
      throw error;
    }
    }
  }
  return [...changedEntityTypes];
}

export function shouldRefreshCloudStorageUsage(
  cache: CloudStorageUsageCache | undefined,
  pending: readonly SyncOutboxItem[],
  now = Date.now(),
) {
  if (!cache) return true;
  const checkedAt = Date.parse(cache.checkedAt);
  if (!Number.isFinite(checkedAt) || now - checkedAt >= CLOUD_STORAGE_CACHE_TTL_MS) return true;
  if (cache.usage.status === 'full' || cache.usage.status === 'over_limit') return false;
  if (!cache.usage.limitBytes) return false;
  const pendingBytes = estimatePendingUploadBytes(pending);
  return pendingBytes > 0
    && cache.usage.usedBytes + pendingBytes >= cache.usage.limitBytes * CLOUD_STORAGE_RECHECK_RATIO;
}

export function estimatePendingUploadBytes(pending: readonly SyncOutboxItem[]) {
  const encoder = new TextEncoder();
  return pending
    .filter((item) => item.operation === 'upsert' && item.payload)
    .reduce((total, item) => total + encoder.encode(JSON.stringify(item.payload)).byteLength, 0);
}

function estimateCloudStorageUsageAfterPush(
  usage: CloudStorageUsage,
  pending: readonly SyncOutboxItem[],
) {
  const pendingBytes = estimatePendingUploadBytes(pending);
  if (pendingBytes === 0 || usage.limitBytes === null) return usage;
  return { ...usage, usedBytes: usage.usedBytes + pendingBytes };
}

async function writeCloudStorageUsageCache(
  database: MochiDatabase,
  usage: CloudStorageUsage,
  checkedAt = new Date().toISOString(),
) {
  await database.put('syncMetadata', { checkedAt, id: CLOUD_STORAGE_CACHE_ID, usage });
}

async function refreshCloudStorageUsageAfterQuotaError(
  client: SupabaseClient,
  database: MochiDatabase,
  fallback: CloudStorageUsage | null,
) {
  const usage = await readCloudStorageUsage(client).catch(() => fallback);
  if (usage) await writeCloudStorageUsageCache(database, usage);
  return usage;
}

export async function readCloudStorageUsage(client: SupabaseClient): Promise<CloudStorageUsage | null> {
  const rpcClient = client as SupabaseClient & {
    rpc?: (fn: string) => Promise<{ data: unknown; error: unknown }>;
  };
  if (!rpcClient.rpc) return null;
  const { data, error } = await rpcClient.rpc('get_cloud_storage_usage');
  if (isMissingStorageUsageRpcError(error)) return null;
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const usage = row as Record<string, unknown>;
  return {
    limitBytes: usage.limitBytes === null || usage.limit_bytes === null
      ? null
      : Number(usage.limitBytes ?? usage.limit_bytes),
    planCode: String(usage.planCode ?? usage.plan_code ?? 'free'),
    status: String(usage.status ?? 'ok') as CloudStorageUsage['status'],
    usedBytes: Number(usage.usedBytes ?? usage.used_bytes ?? 0),
  };
}

export function isStorageQuotaError(error: unknown) {
  if (!error || typeof error !== 'object') return String(error).includes('STORAGE_QUOTA_EXCEEDED');
  const values = Object.values(error as Record<string, unknown>);
  return values.some((value) => typeof value === 'string' && value.includes('STORAGE_QUOTA_EXCEEDED'));
}

function isMissingStorageUsageRpcError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  return candidate.code === 'PGRST202'
    || `${candidate.message ?? ''} ${candidate.details ?? ''}`.includes('get_cloud_storage_usage');
}

async function pullChanges(
  client: SupabaseClient,
  database: MochiDatabase,
  entityTypes: SyncEntityType[],
) {
  const repositories = createMochiRepositories(database);
  const changedEntityTypes = new Set<SyncEntityType>();
  for (const entityType of entityTypes) {
    const cursor = await readSyncCursor(database, entityType);
    const { data, error } = await client
      .from(TABLES[entityType])
      .select('*')
      .gt('sync_version', cursor)
      .order('sync_version', { ascending: true })
      .limit(500);
    if (error) throw error;
    let nextCursor = cursor;
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (rows.length > 0) changedEntityTypes.add(entityType);
    for (const row of rows) nextCursor = Math.max(nextCursor, Number(row.sync_version ?? cursor));
    await applyRemoteRows(entityType, rows, repositories);
    if (nextCursor > cursor) await writeSyncCursor(database, entityType, nextCursor);
  }
  return [...changedEntityTypes];
}

async function applyRemoteRows(
  entityType: SyncEntityType,
  rows: Array<Record<string, unknown>>,
  repositories: ReturnType<typeof createMochiRepositories>,
) {
  if (rows.length === 0) return;
  if (entityType === 'settings') {
    const latestRow = rows.at(-1);
    if (!latestRow) return;
    if (latestRow.deleted_at) {
      await repositories.settings.delete();
    } else {
      await repositories.settings.put(fromRemoteRow(entityType, latestRow) as Settings);
    }
    return;
  }
  const repository = repositoriesFor(entityType, repositories) as unknown as {
    deleteMany(ids: string[]): Promise<unknown>;
    putMany(values: unknown[]): Promise<unknown>;
  };
  const deletedIds = rows.filter((row) => Boolean(row.deleted_at)).map((row) => String(row.id));
  const records = rows
    .filter((row) => !row.deleted_at)
    .map((row) => fromRemoteRow(entityType, row));
  await repository.deleteMany(deletedIds);
  await repository.putMany(records);
}

function repositoriesFor(entityType: SyncEntityType, repositories: ReturnType<typeof createMochiRepositories>) {
  if (entityType === 'folder') return repositories.folders;
  if (entityType === 'note') return repositories.notes;
  if (entityType === 'task') return repositories.tasks;
  if (entityType === 'reminder') return repositories.reminders;
  return repositories.settings;
}

function toRemoteRow(item: SyncOutboxItem, userId: string) {
  const payload = item.payload ?? {};
  const base = {
    client_updated_at: item.clientUpdatedAt,
    deleted_at: item.operation === 'delete' ? item.clientUpdatedAt : null,
    device_id: item.deviceId,
    id: item.entityId,
    user_id: userId,
  };
  if (item.entityType === 'folder') return { ...base, ...folderToRemote(payload) };
  if (item.entityType === 'note') return { ...base, ...noteToRemote(payload) };
  if (item.entityType === 'task') return { ...base, ...taskToRemote(payload) };
  if (item.entityType === 'reminder') return { ...base, ...reminderToRemote(payload) };
  return { ...base, ...settingsToRemote(payload) };
}

function folderToRemote(value: Record<string, unknown>) {
  return { color: value.color, icon: value.icon, name: value.name, parent_id: value.parentId, position: value.position, created_at: value.createdAt, updated_at: value.updatedAt };
}

function noteToRemote(value: Record<string, unknown>) {
  return { archived_at: value.archivedAt, color: value.color, content: value.content ?? {}, favorite: value.favorite, folder_id: value.folderId, pattern: value.pattern, pinned: value.pinned, plain_text: value.plainText, source: value.source, tags: value.tags ?? [], title: value.title, trashed_at: value.deletedAt, created_at: value.createdAt, updated_at: value.updatedAt };
}

function taskToRemote(value: Record<string, unknown>) {
  return { completed_at: value.completedAt, completed_dates: value.completedDates ?? [], due_date: value.dueDate, due_time: value.dueTime, folder_id: value.folderId, position: value.position, recurrence_series_id: value.recurrenceSeriesId, repeat_rule: value.repeatRule, title: value.title, created_at: value.createdAt, updated_at: value.updatedAt };
}

function reminderToRemote(value: Record<string, unknown>) {
  return { enabled: value.enabled, owner_id: value.ownerId, owner_type: value.ownerType, offset_minutes: value.offsetMinutes, recurrence_anchor_day: value.recurrenceAnchorDay, recurrence_due_time: value.recurrenceDueTime, repeat_rule: value.repeatRule, scheduled_at: value.scheduledAt, timezone: value.timezone, created_at: value.createdAt, updated_at: value.updatedAt };
}

function settingsToRemote(value: Record<string, unknown>) {
  return { id: 'app', layout: value.layout, locale: value.locale, recent_colors: value.recentColors ?? [], theme: value.theme, created_at: value.updatedAt, updated_at: value.updatedAt };
}

function fromRemoteRow(entityType: SyncEntityType, row: Record<string, unknown>) {
  if (entityType === 'folder') return { color: row.color, icon: row.icon, id: row.id, name: row.name, parentId: row.parent_id, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at } as unknown as Folder;
  if (entityType === 'note') return { archivedAt: row.archived_at, color: row.color, content: row.content, deletedAt: row.trashed_at, favorite: row.favorite, folderId: row.folder_id, id: row.id, pattern: row.pattern, pinned: row.pinned, plainText: row.plain_text, source: row.source, tags: row.tags ?? [], title: row.title, createdAt: row.created_at, updatedAt: row.updated_at } as unknown as Note;
  if (entityType === 'task') return { completedAt: row.completed_at, completedDates: row.completed_dates ?? [], dueDate: row.due_date, dueTime: row.due_time, folderId: row.folder_id, id: row.id, position: row.position, recurrenceSeriesId: row.recurrence_series_id, repeatRule: row.repeat_rule, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at } as unknown as Task;
  if (entityType === 'reminder') return { enabled: row.enabled, id: row.id, offsetMinutes: row.offset_minutes, ownerId: row.owner_id, ownerType: row.owner_type, recurrenceAnchorDay: row.recurrence_anchor_day, recurrenceDueTime: row.recurrence_due_time, repeatRule: row.repeat_rule, scheduledAt: row.scheduled_at, timezone: row.timezone, createdAt: row.created_at, updatedAt: row.updated_at } as unknown as Reminder;
  return { id: 'app', layout: row.layout, locale: row.locale, recentColors: row.recent_colors ?? [], schemaVersion: MOCHI_DATABASE_VERSION, theme: row.theme, updatedAt: row.updated_at } as unknown as Settings;
}
