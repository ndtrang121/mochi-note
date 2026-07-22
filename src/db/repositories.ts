import type { MochiDatabase } from './database';
import type {
  Attachment,
  Folder,
  Note,
  Reminder,
  Settings,
  Task,
} from './models';
import { normalizeNoteTags } from './noteTags';
import { deleteWithOutbox, putWithOutbox, type SyncMutationContext } from '../supabase/outbox';

export interface CrudRepository<TEntity> {
  delete(id: string): Promise<void>;
  get(id: string): Promise<TEntity | undefined>;
  list(): Promise<TEntity[]>;
  put(entity: TEntity): Promise<void>;
}

export interface FolderRepository extends CrudRepository<Folder> {
  listByParent(parentId: string | null): Promise<Folder[]>;
  listOrdered(): Promise<Folder[]>;
}

export interface NoteRepository extends CrudRepository<Note> {
  listDeleted(): Promise<Note[]>;
  listByFolder(folderId: string): Promise<Note[]>;
  listRecent(limit?: number): Promise<Note[]>;
  search(query: string): Promise<Note[]>;
}

export interface TaskRepository extends CrudRepository<Task> {
  listByDate(dueDate: string): Promise<Task[]>;
}

export interface ReminderRepository extends CrudRepository<Reminder> {
  listDue(until: string): Promise<Reminder[]>;
  listForOwner(ownerType: Reminder['ownerType'], ownerId: string): Promise<Reminder[]>;
}

export interface AttachmentRepository extends CrudRepository<Attachment> {
  listByNote(noteId: string): Promise<Attachment[]>;
}

export interface SettingsRepository {
  get(): Promise<Settings | undefined>;
  put(settings: Settings): Promise<void>;
}

export interface MochiRepositories {
  attachments: AttachmentRepository;
  folders: FolderRepository;
  notes: NoteRepository;
  reminders: ReminderRepository;
  settings: SettingsRepository;
  tasks: TaskRepository;
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
}

function normalizeFolder(folder: Folder) {
  return { ...folder, parentId: folder.parentId ?? null };
}

function normalizeNote(note: Note) {
  return {
    ...note,
    deletedAt: note.deletedAt ?? null,
    tags: normalizeNoteTags(note.tags ?? []),
  };
}

function putCore<TEntity extends { id: string; updatedAt: string }>(
  database: MochiDatabase,
  storeName: 'folders' | 'notes' | 'tasks' | 'reminders' | 'settings',
  entityType: 'folder' | 'note' | 'task' | 'reminder' | 'settings',
  entity: TEntity,
  syncContext?: SyncMutationContext,
) {
  return syncContext
    ? putWithOutbox(database, storeName, entityType, entity as never, syncContext)
    : database.put(storeName, entity as never);
}

function deleteCore(database: MochiDatabase, storeName: 'folders' | 'notes' | 'tasks' | 'reminders' | 'settings', entityType: 'folder' | 'note' | 'task' | 'reminder' | 'settings', entityId: string, syncContext?: SyncMutationContext) {
  return syncContext
    ? deleteWithOutbox(database, storeName, entityType, entityId, syncContext)
    : database.delete(storeName, entityId);
}

export function createMochiRepositories(database: MochiDatabase): MochiRepositories {
  return createRepositories(database);
}

export function createSyncedMochiRepositories(database: MochiDatabase, syncContext: SyncMutationContext): MochiRepositories {
  return createRepositories(database, syncContext);
}

function createRepositories(database: MochiDatabase, syncContext?: SyncMutationContext): MochiRepositories {
  return {
    attachments: {
      async delete(id) {
        await database.delete('attachments', id);
      },
      get(id) {
        return database.get('attachments', id);
      },
      list() {
        return database.getAll('attachments');
      },
      listByNote(noteId) {
        return database.getAllFromIndex('attachments', 'by-note', noteId);
      },
      async put(attachment) {
        await database.put('attachments', attachment);
      },
    },
    folders: {
      async delete(id) {
        await deleteCore(database, 'folders', 'folder', id, syncContext);
      },
      async get(id) {
        const folder = await database.get('folders', id);
        return folder ? normalizeFolder(folder) : undefined;
      },
      async list() {
        return (await database.getAll('folders')).map(normalizeFolder);
      },
      async listByParent(parentId) {
        const folders = parentId
          ? await database.getAllFromIndex('folders', 'by-parent', parentId)
          : await database.getAll('folders');
        return folders
          .map(normalizeFolder)
          .filter((folder) => folder.parentId === parentId)
          .sort((first, second) => first.position - second.position);
      },
      async listOrdered() {
        return (await database.getAllFromIndex('folders', 'by-position')).map(normalizeFolder);
      },
      async put(folder) {
        await putCore(database, 'folders', 'folder', folder, syncContext);
      },
    },
    notes: {
      async delete(id) {
        await deleteCore(database, 'notes', 'note', id, syncContext);
      },
      get(id) {
        return database.get('notes', id).then((note) => note ? normalizeNote(note) : undefined);
      },
      async list() {
        return (await database.getAll('notes')).map(normalizeNote);
      },
      async listByFolder(folderId) {
        return (await database.getAllFromIndex('notes', 'by-folder', folderId))
          .map(normalizeNote)
          .filter((note) => !note.deletedAt);
      },
      async listDeleted() {
        return (await database.getAll('notes'))
          .map(normalizeNote)
          .filter((note) => Boolean(note.deletedAt))
          .sort((first, second) => (second.deletedAt ?? '').localeCompare(first.deletedAt ?? ''));
      },
      async listRecent(limit = 20) {
        const notes = await database.getAllFromIndex('notes', 'by-updated');
        return notes
          .reverse()
          .map(normalizeNote)
          .filter((note) => !note.deletedAt)
          .slice(0, Math.max(0, limit));
      },
      async put(note) {
        await putCore(database, 'notes', 'note', normalizeNote(note), syncContext);
      },
      async search(query) {
        const normalizedQuery = normalizeSearchText(query.trim());
        if (!normalizedQuery) {
          return [];
        }

        const notes = (await database.getAll('notes')).map(normalizeNote);
        return notes.filter((note) =>
          !note.deletedAt &&
          normalizeSearchText(`${note.title} ${note.plainText} ${note.tags.join(' ')}`).includes(normalizedQuery),
        );
      },
    },
    reminders: {
      async delete(id) {
        await deleteCore(database, 'reminders', 'reminder', id, syncContext);
      },
      get(id) {
        return database.get('reminders', id);
      },
      list() {
        return database.getAll('reminders');
      },
      async listDue(until) {
        const reminders = await database.getAllFromIndex(
          'reminders',
          'by-scheduled',
          IDBKeyRange.upperBound(until),
        );
        return reminders.filter((reminder) => reminder.enabled);
      },
      listForOwner(ownerType, ownerId) {
        return database.getAllFromIndex('reminders', 'by-owner', [ownerType, ownerId]);
      },
      async put(reminder) {
        const ownerExisting = await database.getAllFromIndex('reminders', 'by-owner', [reminder.ownerType, reminder.ownerId]);
        const canonical = ownerExisting.find((item) => item.id !== reminder.id);
        const normalizedReminder = canonical ? { ...reminder, id: canonical.id, createdAt: canonical.createdAt } : reminder;
        const existing = await database.get('reminders', reminder.id);
        if (existing && existing.updatedAt > normalizedReminder.updatedAt) return;
        await putCore(database, 'reminders', 'reminder', normalizedReminder, syncContext);
      },
    },
    settings: {
      get() {
        return database.get('settings', 'app');
      },
      async put(settings) {
        await putCore(database, 'settings', 'settings', settings, syncContext);
      },
    },
    tasks: {
      async delete(id) {
        await deleteCore(database, 'tasks', 'task', id, syncContext);
      },
      get(id) {
        return database.get('tasks', id);
      },
      list() {
        return database.getAll('tasks');
      },
      listByDate(dueDate) {
        return database.getAllFromIndex('tasks', 'by-due-date', dueDate);
      },
      async put(task) {
        await putCore(database, 'tasks', 'task', task, syncContext);
      },
    },
  };
}
