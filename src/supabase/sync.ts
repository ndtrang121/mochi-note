import type { SupabaseClient } from '@supabase/supabase-js';

import type { MochiDatabase } from '../db/database';
import { createMochiRepositories } from '../db/repositories';
import type { Folder, Note, Reminder, Settings, Task } from '../db/models';
import { getSupabaseClient } from './client';
import {
  listPendingOutbox,
  readSyncCursor,
  removeOutboxItem,
  saveOutboxRetry,
  writeSyncCursor,
} from './outbox';
import type { SyncEntityType, SyncOutboxItem, SyncResult, SyncState } from './types';

const TABLES: Record<SyncEntityType, string> = {
  folder: 'folders',
  note: 'notes',
  reminder: 'reminders',
  settings: 'app_settings',
  task: 'tasks',
};

export interface SyncUserDataOptions {
  pullScope?: 'all' | 'pending';
}

const INITIAL_SYNC_STATE: SyncState = {
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
  onState?.({ ...INITIAL_SYNC_STATE, pendingCount: pending.length, status: 'syncing' });

  try {
    const acknowledgedEntityTypes = await pushOutbox(client, database, userId, pending);
    const pulledEntityTypes = options?.pullScope === 'pending'
      ? []
      : await pullChanges(client, database, Object.keys(TABLES) as SyncEntityType[]);
    const changedEntityTypes = [...new Set([
      ...acknowledgedEntityTypes,
      ...pulledEntityTypes,
    ])];
    const synced: SyncState = {
      error: null,
      lastSyncedAt: new Date().toISOString(),
      pendingCount: (await listPendingOutbox(database)).length,
      status: 'idle',
    };
    onState?.(synced);
    return { ...synced, changedEntityTypes };
  } catch (error) {
    const failed: SyncState = {
      error: error instanceof Error ? error.message : String(error),
      lastSyncedAt: null,
      pendingCount: (await listPendingOutbox(database)).length,
      status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
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
    try {
      const rows = items.map((item) => toRemoteRow(item, userId));
      const { data, error } = await client
        .from(TABLES[entityType])
        .upsert(rows as never, { onConflict: 'user_id,id' })
        .select('*');
      if (error) throw error;
      for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        changedEntityTypes.add(entityType);
        await applyRemoteRow(entityType, row, repositories);
      }
      await Promise.all(items.map((item) => removeOutboxItem(database, item)));
    } catch (error) {
      await Promise.all(items.map((item) => saveOutboxRetry(database, item, error)));
      throw error;
    }
  }
  return [...changedEntityTypes];
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
    for (const row of rows) {
      changedEntityTypes.add(entityType);
      nextCursor = Math.max(nextCursor, Number(row.sync_version ?? cursor));
      await applyRemoteRow(entityType, row, repositories);
    }
    if (nextCursor > cursor) await writeSyncCursor(database, entityType, nextCursor);
  }
  return [...changedEntityTypes];
}

async function applyRemoteRow(
  entityType: SyncEntityType,
  row: Record<string, unknown>,
  repositories: ReturnType<typeof createMochiRepositories>,
) {
  if (row.deleted_at) {
    await (repositoriesFor(entityType, repositories) as unknown as { delete(id: string): Promise<unknown> }).delete(String(row.id));
    return;
  }
  await (repositoriesFor(entityType, repositories) as unknown as { put(value: never): Promise<unknown> }).put(fromRemoteRow(entityType, row) as never);
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
  const source = value.source && typeof value.source === 'object' ? { ...(value.source as Record<string, unknown>) } : value.source;
  if (source && typeof source === 'object') delete (source as Record<string, unknown>).screenshotAttachmentId;
  return { archived_at: value.archivedAt, color: value.color, content: value.content ?? {}, favorite: value.favorite, folder_id: value.folderId, pattern: value.pattern, pinned: value.pinned, plain_text: value.plainText, source, tags: value.tags ?? [], title: value.title, trashed_at: value.deletedAt, created_at: value.createdAt, updated_at: value.updatedAt };
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
  return { id: 'app', layout: row.layout, locale: row.locale, recentColors: row.recent_colors ?? [], schemaVersion: 6, theme: row.theme, updatedAt: row.updated_at } as unknown as Settings;
}
