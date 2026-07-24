import type { MochiDatabase } from './database';
import type {
  Folder,
  Note,
  Reminder,
  Settings,
  Task,
} from './models';
import { normalizeNoteTags } from './noteTags';
import { deleteManyWithOutbox, deleteWithOutbox, putManyWithOutbox, putWithOutbox, type SyncMutationContext } from '../supabase/outbox';

export type NoteSummary = Pick<Note, 'color' | 'id' | 'plainText' | 'title' | 'updatedAt'>;

export interface CrudRepository<TEntity> {
  delete(id: string): Promise<void>;
  deleteMany(ids: readonly string[]): Promise<void>;
  get(id: string): Promise<TEntity | undefined>;
  list(): Promise<TEntity[]>;
  put(entity: TEntity): Promise<void>;
  putMany(entities: readonly TEntity[]): Promise<void>;
}

export interface FolderRepository extends CrudRepository<Folder> {
  listByParent(parentId: string | null): Promise<Folder[]>;
  listOrdered(): Promise<Folder[]>;
}

export interface NoteRepository extends CrudRepository<Note> {
  listDeleted(): Promise<Note[]>;
  listByFolder(folderId: string): Promise<Note[]>;
  listRecent(limit?: number): Promise<Note[]>;
  listRecentSummaries(limit?: number): Promise<NoteSummary[]>;
  search(query: string): Promise<Note[]>;
}

export interface TaskRepository extends CrudRepository<Task> {
  listByDate(dueDate: string): Promise<Task[]>;
}

export interface ReminderRepository extends CrudRepository<Reminder> {
  listDue(until: string): Promise<Reminder[]>;
  listForOwner(ownerType: Reminder['ownerType'], ownerId: string): Promise<Reminder[]>;
}

export interface SettingsRepository {
  delete(): Promise<void>;
  get(): Promise<Settings | undefined>;
  put(settings: Settings): Promise<void>;
}

export interface MochiRepositories {
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

function summarizeNote(note: Note): NoteSummary {
  return {
    color: note.color,
    id: note.id,
    plainText: note.plainText,
    title: note.title,
    updatedAt: note.updatedAt,
  };
}

function putManyCore<TEntity extends { id: string; updatedAt: string }>(
  database: MochiDatabase,
  storeName: 'folders' | 'notes' | 'tasks' | 'reminders' | 'settings',
  entityType: 'folder' | 'note' | 'task' | 'reminder' | 'settings',
  entities: readonly TEntity[],
  syncContext?: SyncMutationContext,
) {
  if (entities.length === 0) return Promise.resolve();
  if (syncContext) return putManyWithOutbox(database, storeName, entityType, entities, syncContext);
  const transaction = database.transaction(storeName, 'readwrite');
  return Promise.all(entities.map((entity) => transaction.store.put(entity as never)))
    .then(() => transaction.done);
}

function deleteCore(database: MochiDatabase, storeName: 'folders' | 'notes' | 'tasks' | 'reminders' | 'settings', entityType: 'folder' | 'note' | 'task' | 'reminder' | 'settings', entityId: string, syncContext?: SyncMutationContext) {
  return syncContext
    ? deleteWithOutbox(database, storeName, entityType, entityId, syncContext)
    : database.delete(storeName, entityId);
}

function deleteManyCore(
  database: MochiDatabase,
  storeName: 'folders' | 'notes' | 'tasks' | 'reminders' | 'settings',
  entityType: 'folder' | 'note' | 'task' | 'reminder' | 'settings',
  entityIds: readonly string[],
  syncContext?: SyncMutationContext,
) {
  if (entityIds.length === 0) return Promise.resolve();
  if (syncContext) return deleteManyWithOutbox(database, storeName, entityType, entityIds, syncContext);
  const transaction = database.transaction(storeName, 'readwrite');
  return Promise.all(entityIds.map((entityId) => transaction.store.delete(entityId)))
    .then(() => transaction.done);
}

export function createMochiRepositories(database: MochiDatabase): MochiRepositories {
  return createRepositories(database);
}

export function createSyncedMochiRepositories(database: MochiDatabase, syncContext: SyncMutationContext): MochiRepositories {
  return createRepositories(database, syncContext);
}

function createRepositories(database: MochiDatabase, syncContext?: SyncMutationContext): MochiRepositories {
  return {
    folders: {
      async delete(id) {
        await deleteCore(database, 'folders', 'folder', id, syncContext);
      },
      async deleteMany(ids) {
        await deleteManyCore(database, 'folders', 'folder', ids, syncContext);
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
      putMany(folders) {
        return putManyCore(database, 'folders', 'folder', folders, syncContext);
      },
    },
    notes: {
      async delete(id) {
        await deleteCore(database, 'notes', 'note', id, syncContext);
      },
      async deleteMany(ids) {
        await deleteManyCore(database, 'notes', 'note', ids, syncContext);
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
        const notes: Note[] = [];
        for await (const cursor of database.transaction('notes').store.index('by-updated').iterate(null, 'prev')) {
          const note = normalizeNote(cursor.value);
          if (note.deletedAt) continue;
          notes.push(note);
          if (notes.length >= Math.max(0, limit)) break;
        }
        return notes;
      },
      async listRecentSummaries(limit = 20) {
        const notes: NoteSummary[] = [];
        for await (const cursor of database.transaction('notes').store.index('by-updated').iterate(null, 'prev')) {
          const note = normalizeNote(cursor.value);
          if (note.deletedAt) continue;
          notes.push(summarizeNote(note));
          if (notes.length >= Math.max(0, limit)) break;
        }
        return notes;
      },
      async put(note) {
        await putCore(database, 'notes', 'note', normalizeNote(note), syncContext);
      },
      putMany(notes) {
        return putManyCore(database, 'notes', 'note', notes.map(normalizeNote), syncContext);
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
      async deleteMany(ids) {
        await deleteManyCore(database, 'reminders', 'reminder', ids, syncContext);
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
      async putMany(reminders) {
        for (const reminder of reminders) await this.put(reminder);
      },
    },
    settings: {
      async delete() {
        await database.delete('settings', 'app');
      },
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
      async deleteMany(ids) {
        await deleteManyCore(database, 'tasks', 'task', ids, syncContext);
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
      putMany(tasks) {
        return putManyCore(database, 'tasks', 'task', tasks, syncContext);
      },
    },
  };
}
