import type { MochiDatabase } from '../../db/database';
import { MOCHI_DATABASE_VERSION } from '../../db/migrations';
import type {
  Attachment,
  AttachmentKind,
  Folder,
  Note,
  NoteColor,
  NotePattern,
  Reminder,
  Settings,
  Task,
} from '../../db/models';

export const MOCHI_BACKUP_FORMAT = 'mochinote-backup';
export const MOCHI_BACKUP_VERSION = 1;

const COLORS: readonly NoteColor[] = ['blush', 'blue', 'lilac', 'peach', 'sage', 'yellow'];
const PATTERNS: readonly NotePattern[] = [
  'dots',
  'grid',
  'hearts',
  'lined',
  'plain',
  'stars',
  'stripes',
];
const ATTACHMENT_KINDS: readonly AttachmentKind[] = ['audio', 'capture', 'file', 'image'];
const STORE_NAMES = ['attachments', 'folders', 'notes', 'reminders', 'settings', 'tasks'] as const;

export interface SerializedAttachment extends Omit<Attachment, 'blob'> {
  dataBase64: string;
}

export interface MochiBackup {
  data: {
    attachments: SerializedAttachment[];
    folders: Folder[];
    notes: Note[];
    reminders: Reminder[];
    settings: Settings;
    tasks: Task[];
  };
  databaseSchemaVersion: number;
  exportedAt: string;
  format: typeof MOCHI_BACKUP_FORMAT;
  version: typeof MOCHI_BACKUP_VERSION;
}

export interface BackupPreview {
  attachments: number;
  exportedAt: string;
  folders: number;
  notes: number;
  reminders: number;
  tasks: number;
}

export type RestoreMode = 'merge' | 'replace';

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string) {
  if (!isRecord(value)) throw new BackupValidationError(`${path} must be an object.`);
  return value;
}

function requireString(value: unknown, path: string, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new BackupValidationError(`${path} must be a valid string.`);
  }
  return value;
}

function requireNullableString(value: unknown, path: string) {
  if (value === null) return null;
  return requireString(value, path);
}

function requireNumber(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupValidationError(`${path} must be a valid number.`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') throw new BackupValidationError(`${path} must be a boolean.`);
  return value;
}

function requireIsoDateTime(value: unknown, path: string) {
  const text = requireString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new BackupValidationError(`${path} must be a valid ISO date-time.`);
  }
  return text;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new BackupValidationError(`${path} must be an array.`);
  return value as unknown[];
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], path: string) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new BackupValidationError(`${path} contains an unsupported value.`);
  }
  return value as T;
}

function assertUniqueIds(items: Array<{ id: string }>, path: string) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new BackupValidationError(`${path} contains duplicate id: ${item.id}.`);
    ids.add(item.id);
  }
}

function parseFolder(value: unknown, index: number): Folder {
  const path = `data.folders[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireString(item.id, `${path}.id`),
    name: requireString(item.name, `${path}.name`),
    color: requireEnum(item.color, COLORS, `${path}.color`),
    icon: requireString(item.icon, `${path}.icon`),
    parentId: requireNullableString(item.parentId, `${path}.parentId`),
    position: requireNumber(item.position, `${path}.position`),
    createdAt: requireIsoDateTime(item.createdAt, `${path}.createdAt`),
    updatedAt: requireIsoDateTime(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseNote(value: unknown, index: number): Note {
  const path = `data.notes[${index}]`;
  const item = requireRecord(value, path);
  if (!('content' in item)) throw new BackupValidationError(`${path}.content is required.`);
  const source = item.source === null ? null : requireRecord(item.source, `${path}.source`);
  return {
    id: requireString(item.id, `${path}.id`),
    title: requireString(item.title, `${path}.title`, true),
    content: item.content as Note['content'],
    plainText: requireString(item.plainText, `${path}.plainText`, true),
    folderId: requireNullableString(item.folderId, `${path}.folderId`),
    color: requireEnum(item.color, COLORS, `${path}.color`),
    pattern: requireEnum(item.pattern, PATTERNS, `${path}.pattern`),
    pinned: requireBoolean(item.pinned, `${path}.pinned`),
    favorite: requireBoolean(item.favorite, `${path}.favorite`),
    source: source
      ? {
          capturedAt: requireIsoDateTime(source.capturedAt, `${path}.source.capturedAt`),
          faviconUrl:
            source.faviconUrl === undefined
              ? undefined
              : requireString(source.faviconUrl, `${path}.source.faviconUrl`),
          pageTitle: requireString(source.pageTitle, `${path}.source.pageTitle`, true),
          screenshotAttachmentId:
            source.screenshotAttachmentId === undefined
              ? undefined
              : requireString(
                  source.screenshotAttachmentId,
                  `${path}.source.screenshotAttachmentId`,
                ),
          url: requireString(source.url, `${path}.source.url`),
        }
      : null,
    createdAt: requireIsoDateTime(item.createdAt, `${path}.createdAt`),
    updatedAt: requireIsoDateTime(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseTask(value: unknown, index: number): Task {
  const path = `data.tasks[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireString(item.id, `${path}.id`),
    title: requireString(item.title, `${path}.title`),
    dueDate: requireNullableString(item.dueDate, `${path}.dueDate`),
    dueTime: requireNullableString(item.dueTime, `${path}.dueTime`),
    folderId: requireNullableString(item.folderId, `${path}.folderId`),
    completedAt:
      item.completedAt === null
        ? null
        : requireIsoDateTime(item.completedAt, `${path}.completedAt`),
    position: requireNumber(item.position, `${path}.position`),
    createdAt: requireIsoDateTime(item.createdAt, `${path}.createdAt`),
    updatedAt: requireIsoDateTime(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseReminder(value: unknown, index: number): Reminder {
  const path = `data.reminders[${index}]`;
  const item = requireRecord(value, path);
  return {
    id: requireString(item.id, `${path}.id`),
    ownerId: requireString(item.ownerId, `${path}.ownerId`),
    ownerType: requireEnum(item.ownerType, ['note', 'task'] as const, `${path}.ownerType`),
    scheduledAt: requireIsoDateTime(item.scheduledAt, `${path}.scheduledAt`),
    timezone: requireString(item.timezone, `${path}.timezone`),
    repeatRule: requireNullableString(item.repeatRule, `${path}.repeatRule`),
    enabled: requireBoolean(item.enabled, `${path}.enabled`),
    createdAt: requireIsoDateTime(item.createdAt, `${path}.createdAt`),
    updatedAt: requireIsoDateTime(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseAttachment(value: unknown, index: number): SerializedAttachment {
  const path = `data.attachments[${index}]`;
  const item = requireRecord(value, path);
  const dataBase64 = requireString(item.dataBase64, `${path}.dataBase64`, true);
  const size = requireNumber(item.size, `${path}.size`);
  if (size < 0 || !Number.isInteger(size)) {
    throw new BackupValidationError(`${path}.size must be a non-negative integer.`);
  }
  return {
    id: requireString(item.id, `${path}.id`),
    noteId: requireString(item.noteId, `${path}.noteId`),
    kind: requireEnum(item.kind, ATTACHMENT_KINDS, `${path}.kind`),
    mimeType: requireString(item.mimeType, `${path}.mimeType`),
    size,
    dataBase64,
    createdAt: requireIsoDateTime(item.createdAt, `${path}.createdAt`),
    updatedAt: requireIsoDateTime(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseSettings(value: unknown): Settings {
  const item = requireRecord(value, 'data.settings');
  if (item.id !== 'app') throw new BackupValidationError('data.settings.id must be "app".');
  return {
    id: 'app',
    layout: requireEnum(item.layout, ['grid', 'list'] as const, 'data.settings.layout'),
    locale: requireEnum(item.locale, ['en', 'vi'] as const, 'data.settings.locale'),
    recentColors: requireArray(item.recentColors, 'data.settings.recentColors').map(
      (color, index) => requireEnum(color, COLORS, `data.settings.recentColors[${index}]`),
    ),
    schemaVersion: requireNumber(item.schemaVersion, 'data.settings.schemaVersion'),
    theme: requireEnum(item.theme, ['dark', 'light', 'system'] as const, 'data.settings.theme'),
    updatedAt: requireIsoDateTime(item.updatedAt, 'data.settings.updatedAt'),
  };
}

function validateReferences(backup: MochiBackup) {
  const folderIds = new Set(backup.data.folders.map(({ id }) => id));
  const noteIds = new Set(backup.data.notes.map(({ id }) => id));
  const taskIds = new Set(backup.data.tasks.map(({ id }) => id));
  const attachmentsById = new Map(backup.data.attachments.map((item) => [item.id, item]));

  for (const folder of backup.data.folders) {
    if (folder.parentId && (!folderIds.has(folder.parentId) || folder.parentId === folder.id)) {
      throw new BackupValidationError(`Folder ${folder.id} has an invalid parentId reference.`);
    }
  }
  for (const note of backup.data.notes) {
    if (note.folderId && !folderIds.has(note.folderId)) {
      throw new BackupValidationError(`Note ${note.id} references a missing folder.`);
    }
    if (note.source?.screenshotAttachmentId) {
      const attachment = attachmentsById.get(note.source.screenshotAttachmentId);
      if (!attachment || attachment.noteId !== note.id) {
        throw new BackupValidationError(`Note ${note.id} references an invalid screenshot attachment.`);
      }
    }
  }
  for (const task of backup.data.tasks) {
    if (task.folderId && !folderIds.has(task.folderId)) {
      throw new BackupValidationError(`Task ${task.id} references a missing folder.`);
    }
  }
  for (const attachment of backup.data.attachments) {
    if (!noteIds.has(attachment.noteId)) {
      throw new BackupValidationError(`Attachment ${attachment.id} references a missing note.`);
    }
    const bytes = decodeBase64(attachment.dataBase64, `Tá»‡p ${attachment.id}`);
    if (bytes.byteLength !== attachment.size) {
      throw new BackupValidationError(`Attachment ${attachment.id} size does not match its data.`);
    }
  }
  for (const reminder of backup.data.reminders) {
    const ownerExists =
      reminder.ownerType === 'note'
        ? noteIds.has(reminder.ownerId)
        : taskIds.has(reminder.ownerId);
    if (!ownerExists) {
      throw new BackupValidationError(`Reminder ${reminder.id} references a missing owner.`);
    }
  }
}

export function validateBackup(value: unknown): MochiBackup {
  const root = requireRecord(value, 'backup');
  if (root.format !== MOCHI_BACKUP_FORMAT) {
    throw new BackupValidationError('This is not a MochiNote backup.');
  }
  if (root.version !== MOCHI_BACKUP_VERSION) {
    throw new BackupValidationError(`Backup version ${String(root.version)} is not supported.`);
  }
  if (root.databaseSchemaVersion !== MOCHI_DATABASE_VERSION) {
    throw new BackupValidationError(
      `Schema ${String(root.databaseSchemaVersion)} is incompatible with schema ${MOCHI_DATABASE_VERSION}.`,
    );
  }
  const data = requireRecord(root.data, 'data');
  const backup: MochiBackup = {
    format: MOCHI_BACKUP_FORMAT,
    version: MOCHI_BACKUP_VERSION,
    databaseSchemaVersion: MOCHI_DATABASE_VERSION,
    exportedAt: requireIsoDateTime(root.exportedAt, 'exportedAt'),
    data: {
      attachments: requireArray(data.attachments, 'data.attachments').map(parseAttachment),
      folders: requireArray(data.folders, 'data.folders').map(parseFolder),
      notes: requireArray(data.notes, 'data.notes').map(parseNote),
      reminders: requireArray(data.reminders, 'data.reminders').map(parseReminder),
      settings: parseSettings(data.settings),
      tasks: requireArray(data.tasks, 'data.tasks').map(parseTask),
    },
  };
  assertUniqueIds(backup.data.attachments, 'data.attachments');
  assertUniqueIds(backup.data.folders, 'data.folders');
  assertUniqueIds(backup.data.notes, 'data.notes');
  assertUniqueIds(backup.data.reminders, 'data.reminders');
  assertUniqueIds(backup.data.tasks, 'data.tasks');
  validateReferences(backup);
  return backup;
}

export function parseBackupJson(json: string) {
  try {
    return validateBackup(JSON.parse(json) as unknown);
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    throw new BackupValidationError('The JSON file is invalid or corrupted.');
  }
}

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string, label = 'Base64 data') {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new BackupValidationError(`${label} is not valid base64.`);
  }
}

async function blobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  if (typeof Response !== 'undefined') {
    return new Uint8Array(await new Response(blob).arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read attachment data.'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

export async function createBackup(database: MochiDatabase): Promise<MochiBackup> {
  const transaction = database.transaction(STORE_NAMES, 'readonly');
  const [attachments, folders, notes, reminders, settings, tasks] = await Promise.all([
    transaction.objectStore('attachments').getAll(),
    transaction.objectStore('folders').getAll(),
    transaction.objectStore('notes').getAll(),
    transaction.objectStore('reminders').getAll(),
    transaction.objectStore('settings').get('app'),
    transaction.objectStore('tasks').getAll(),
  ]);
  await transaction.done;
  if (!settings) throw new Error('MochiNote settings are missing from the backup source.');
  const serializedAttachments = await Promise.all(
    attachments.map(async ({ blob, ...attachment }) => ({
      ...attachment,
      dataBase64: encodeBase64(await blobBytes(blob)),
    })),
  );
  return validateBackup({
    format: MOCHI_BACKUP_FORMAT,
    version: MOCHI_BACKUP_VERSION,
    databaseSchemaVersion: MOCHI_DATABASE_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      attachments: serializedAttachments,
      folders: folders.map((folder) => ({ ...folder, parentId: folder.parentId ?? null })),
      notes,
      reminders,
      settings,
      tasks,
    },
  });
}

export function backupPreview(backup: MochiBackup): BackupPreview {
  return {
    attachments: backup.data.attachments.length,
    exportedAt: backup.exportedAt,
    folders: backup.data.folders.length,
    notes: backup.data.notes.length,
    reminders: backup.data.reminders.length,
    tasks: backup.data.tasks.length,
  };
}

export async function restoreBackup(
  database: MochiDatabase,
  backupValue: MochiBackup,
  mode: RestoreMode,
) {
  const backup = validateBackup(backupValue);
  const attachments: Attachment[] = backup.data.attachments.map(
    ({ dataBase64, ...attachment }) => ({
      ...attachment,
      blob: new Blob([decodeBase64(dataBase64)], { type: attachment.mimeType }),
    }),
  );
  const transaction = database.transaction(STORE_NAMES, 'readwrite');
  if (mode === 'replace') {
    await Promise.all(STORE_NAMES.map((name) => transaction.objectStore(name).clear()));
  }
  await Promise.all([
    ...attachments.map((item) => transaction.objectStore('attachments').put(item)),
    ...backup.data.folders.map((item) => transaction.objectStore('folders').put(item)),
    ...backup.data.notes.map((item) => transaction.objectStore('notes').put(item)),
    ...backup.data.reminders.map((item) => transaction.objectStore('reminders').put(item)),
    transaction.objectStore('settings').put(backup.data.settings),
    ...backup.data.tasks.map((item) => transaction.objectStore('tasks').put(item)),
  ]);
  await transaction.done;
}

export function backupToJson(backup: MochiBackup) {
  return JSON.stringify(backup, null, 2);
}
