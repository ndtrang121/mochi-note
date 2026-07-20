import { deleteMochiDatabase, type MochiDatabase } from '../db/database';
import { MOCHI_DATABASE_VERSION } from '../db/migrations';
import type { Folder, Note, Reminder, Settings, Task } from '../db/models';
import {
  createBackup,
  MOCHI_BACKUP_FORMAT,
  MOCHI_BACKUP_VERSION,
  restoreBackup,
  type MochiBackup,
  type SerializedAttachment,
} from '../features/data-portability/backup';
import { sha256Hex } from './syncCrypto';
import type { LocalSyncEntity, SyncDataSource, SyncEntityRecord } from './syncTypes';

interface SyncAttachmentValue extends Omit<SerializedAttachment, 'dataBase64'> {
  blobHash: string;
}

export class MochiDatabaseSyncDataSource implements SyncDataSource {
  constructor(private readonly database: MochiDatabase) {}

  async clear() {
    const databaseName = this.database.name;
    this.database.close();
    await deleteMochiDatabase(databaseName);
  }
  async read() {
    const backup = await createBackup(this.database);
    const blobs = new Map<string, Uint8Array>();
    const attachmentEntities = await Promise.all(backup.data.attachments.map(async ({ dataBase64, ...attachment }) => {
      const bytes = decodeBase64(dataBase64);
      const blobHash = await sha256Hex(bytes);
      blobs.set(blobHash, bytes);
      return entity('attachment', attachment.id, { ...attachment, blobHash });
    }));
    return {
      blobs,
      entities: [
        ...attachmentEntities,
        ...backup.data.folders.map((item) => entity('folder', item.id, item)),
        ...backup.data.notes.map((item) => entity('note', item.id, item)),
        ...backup.data.reminders.map((item) => entity('reminder', item.id, item)),
        entity('settings', backup.data.settings.id, backup.data.settings),
        ...backup.data.tasks.map((item) => entity('task', item.id, item)),
      ],
    };
  }

  async replace(records: SyncEntityRecord[], readBlob: (hash: string) => Promise<Uint8Array>) {
    const active = records.filter((record) => !record.deleted && record.value);
    const folders = valuesOf<Folder>(active, 'folder');
    const folderIds = new Set(folders.map(({ id }) => id));
    const normalizedFolders = folders.map((folder) => ({
      ...folder,
      parentId: folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null,
    }));
    const attachmentValues = valuesOf<SyncAttachmentValue>(active, 'attachment');
    const attachmentById = new Map(attachmentValues.map((item) => [item.id, item]));
    const notes = valuesOf<Note>(active, 'note').map((note) => normalizeNoteReferences(note, folderIds, attachmentById));
    const noteIds = new Set(notes.map(({ id }) => id));
    const attachments = attachmentValues.filter((item) => noteIds.has(item.noteId));
    const tasks = valuesOf<Task>(active, 'task').map((task) => ({
      ...task,
      folderId: task.folderId && folderIds.has(task.folderId) ? task.folderId : null,
    }));
    const taskIds = new Set(tasks.map(({ id }) => id));
    const reminders = valuesOf<Reminder>(active, 'reminder').filter((reminder) =>
      reminder.ownerType === 'note' ? noteIds.has(reminder.ownerId) : taskIds.has(reminder.ownerId),
    );
    const settings = valuesOf<Settings>(active, 'settings').find(({ id }) => id === 'app');
    if (!settings) throw new Error('Merged sync snapshot does not contain MochiNote settings.');

    // References are normalized before validated replace so independent entity merges remain consistent.
    const serializedAttachments = await Promise.all(attachments.map(async ({ blobHash, ...attachment }) => ({
      ...attachment,
      dataBase64: encodeBase64(await readBlob(blobHash)),
    })));
    const backup: MochiBackup = {
      data: {
        attachments: serializedAttachments,
        folders: normalizedFolders,
        notes,
        reminders,
        settings: { ...settings, schemaVersion: MOCHI_DATABASE_VERSION },
        tasks,
      },
      databaseSchemaVersion: MOCHI_DATABASE_VERSION,
      exportedAt: new Date().toISOString(),
      format: MOCHI_BACKUP_FORMAT,
      version: MOCHI_BACKUP_VERSION,
    };
    await restoreBackup(this.database, backup, 'replace');
  }
}

function entity(
  entityType: LocalSyncEntity['entityType'],
  id: string,
  value: object,
): LocalSyncEntity {
  return { entityType, id, value: value as Record<string, unknown> };
}

function valuesOf<T>(records: SyncEntityRecord[], entityType: SyncEntityRecord['entityType']) {
  return records
    .filter((record) => record.entityType === entityType && record.value)
    .map((record) => record.value as T);
}

function normalizeNoteReferences(
  note: Note,
  folderIds: Set<string>,
  attachmentById: Map<string, SyncAttachmentValue>,
) {
  const folderId = note.folderId && folderIds.has(note.folderId) ? note.folderId : null;
  if (!note.source?.screenshotAttachmentId) return { ...note, folderId };
  const attachment = attachmentById.get(note.source.screenshotAttachmentId);
  if (attachment?.noteId === note.id) return { ...note, folderId };
  const source = { ...note.source };
  delete source.screenshotAttachmentId;
  return { ...note, folderId, source };
}

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
