import type { MochiDatabase } from './database';
import type {
  Attachment,
  Folder,
  Note,
  Reminder,
  Settings,
  Task,
} from './models';

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

export function createMochiRepositories(database: MochiDatabase): MochiRepositories {
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
        await database.delete('folders', id);
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
        await database.put('folders', folder);
      },
    },
    notes: {
      async delete(id) {
        await database.delete('notes', id);
      },
      get(id) {
        return database.get('notes', id);
      },
      list() {
        return database.getAll('notes');
      },
      listByFolder(folderId) {
        return database.getAllFromIndex('notes', 'by-folder', folderId);
      },
      async listRecent(limit = 20) {
        const notes = await database.getAllFromIndex('notes', 'by-updated');
        return notes.reverse().slice(0, Math.max(0, limit));
      },
      async put(note) {
        await database.put('notes', note);
      },
      async search(query) {
        const normalizedQuery = normalizeSearchText(query.trim());
        if (!normalizedQuery) {
          return [];
        }

        const notes = await database.getAll('notes');
        return notes.filter((note) =>
          normalizeSearchText(`${note.title} ${note.plainText}`).includes(normalizedQuery),
        );
      },
    },
    reminders: {
      async delete(id) {
        await database.delete('reminders', id);
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
        await database.put('reminders', reminder);
      },
    },
    settings: {
      get() {
        return database.get('settings', 'app');
      },
      async put(settings) {
        await database.put('settings', settings);
      },
    },
    tasks: {
      async delete(id) {
        await database.delete('tasks', id);
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
        await database.put('tasks', task);
      },
    },
  };
}
