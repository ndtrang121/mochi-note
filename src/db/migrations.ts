import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';

import type { CloudStorageUsageCache, SyncCursor, SyncOutboxItem } from '../supabase/types';
import type { Folder, Note, Reminder, Settings, Task } from './models';

export const MOCHI_DATABASE_VERSION = 9;

const LEGACY_SAMPLE_IDS = {
  folders: ['folder-work', 'folder-study', 'folder-personal', 'folder-ideas'],
  notes: ['note-month-plan', 'note-content-ideas', 'note-client-meeting', 'note-shopping'],
  reminders: ['reminder-client-meeting'],
  tasks: [
    'task-design-system',
    'task-team-meeting',
    'task-weekly-report',
    'task-evening-meditation',
    'task-water-plants',
  ],
} as const;

export interface MochiDatabaseSchema extends DBSchema {
  folders: {
    indexes: {
      'by-name': string;
      'by-parent': string;
      'by-position': number;
    };
    key: string;
    value: Folder;
  };
  notes: {
    indexes: {
      'by-folder': string;
      'by-updated': string;
    };
    key: string;
    value: Note;
  };
  reminders: {
    indexes: {
      'by-owner': [string, string];
      'by-scheduled': string;
    };
    key: string;
    value: Reminder;
  };
  settings: {
    key: Settings['id'];
    value: Settings;
  };
  tasks: {
    indexes: {
      'by-due-date': string;
      'by-folder': string;
      'by-position': number;
    };
    key: string;
    value: Task;
  };
  syncCursors: {
    key: SyncCursor['entityType'];
    value: SyncCursor;
  };
  syncOutbox: {
    indexes: {
      'by-entity': [string, string];
      'by-next-at': string;
      'by-updated': string;
    };
    key: string;
    value: SyncOutboxItem;
  };
  syncMetadata: {
    key: CloudStorageUsageCache['id'];
    value: CloudStorageUsageCache;
  };
}

interface DatabaseMigration {
  migrate: (
    database: IDBPDatabase<MochiDatabaseSchema>,
    transaction: IDBPTransaction<
      MochiDatabaseSchema,
      ArrayLike<StoreNames<MochiDatabaseSchema>>,
      'versionchange'
    >,
  ) => void;
  version: number;
}

const MIGRATIONS: readonly DatabaseMigration[] = [
  {
    version: 1,
    migrate(database) {
      const folders = database.createObjectStore('folders', { keyPath: 'id' });
      folders.createIndex('by-name', 'name');
      folders.createIndex('by-position', 'position');

      const notes = database.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('by-folder', 'folderId');
      notes.createIndex('by-updated', 'updatedAt');

      const tasks = database.createObjectStore('tasks', { keyPath: 'id' });
      tasks.createIndex('by-due-date', 'dueDate');
      tasks.createIndex('by-folder', 'folderId');
      tasks.createIndex('by-position', 'position');

      const reminders = database.createObjectStore('reminders', { keyPath: 'id' });
      reminders.createIndex('by-owner', ['ownerType', 'ownerId']);
      reminders.createIndex('by-scheduled', 'scheduledAt');

      database.createObjectStore('settings', { keyPath: 'id' });
    },
  },
  {
    version: 2,
    migrate(_database, transaction) {
      const folders = transaction.objectStore('folders');
      folders.createIndex('by-parent', 'parentId');
    },
  },
  {
    version: 3,
    migrate(_database, transaction) {
      const notes = transaction.objectStore('notes');
      const settings = transaction.objectStore('settings');
      void notes.openCursor().then(async function backfillTags(cursor): Promise<void> {
        if (!cursor) return;
        const note = cursor.value;
        if (!Array.isArray(note.tags)) {
          await cursor.update({ ...note, tags: [] });
        }
        return cursor.continue().then(backfillTags);
      });
      void settings.get('app').then((current) => {
        if (current && current.schemaVersion !== 3) {
          return settings.put({ ...current, schemaVersion: 3 });
        }
        return undefined;
      });
    },
  },
  {
    version: 4,
    migrate(_database, transaction) {
      const notes = transaction.objectStore('notes');
      const settings = transaction.objectStore('settings');
      void notes.openCursor().then(async function backfillDeletedAt(cursor): Promise<void> {
        if (!cursor) return;
        const note = cursor.value;
        if ((note as Partial<Note>).deletedAt === undefined) {
          await cursor.update({ ...note, deletedAt: null });
        }
        return cursor.continue().then(backfillDeletedAt);
      });
      void settings.get('app').then((current) => {
        if (current && current.schemaVersion !== 4) {
          return settings.put({ ...current, schemaVersion: 4 });
        }
        return undefined;
      });
    },
  },
  {
    version: 5,
    migrate(_database, transaction) {
      // Remove only deterministic demo records; user-created records remain untouched during upgrade.
      for (const id of LEGACY_SAMPLE_IDS.folders) void transaction.objectStore('folders').delete(id);
      for (const id of LEGACY_SAMPLE_IDS.notes) void transaction.objectStore('notes').delete(id);
      for (const id of LEGACY_SAMPLE_IDS.reminders) void transaction.objectStore('reminders').delete(id);
      for (const id of LEGACY_SAMPLE_IDS.tasks) void transaction.objectStore('tasks').delete(id);

      const settings = transaction.objectStore('settings');
      void settings.get('app').then((current) => {
        if (current && current.schemaVersion !== 5) {
          return settings.put({ ...current, schemaVersion: 5 });
        }
        return undefined;
      });
    },
  },
  {
    version: 6,
    migrate(database, transaction) {
      const outbox = database.createObjectStore('syncOutbox', { keyPath: 'id' });
      outbox.createIndex('by-entity', ['entityType', 'entityId']);
      outbox.createIndex('by-next-at', 'nextAttemptAt');
      outbox.createIndex('by-updated', 'clientUpdatedAt');
      database.createObjectStore('syncCursors', { keyPath: 'entityType' });
      const settings = transaction.objectStore('settings');
      void settings.get('app').then((current) => current ? settings.put({ ...current, schemaVersion: 6 }) : undefined);
    },
  },
  {
    version: 7,
    migrate(_database, transaction) {
      // Account databases created by older builds may already be past the original
      // sample cleanup. Remove the deterministic fixtures and their pending uploads.
      for (const id of LEGACY_SAMPLE_IDS.folders) {
        void transaction.objectStore('folders').delete(id);
        void transaction.objectStore('syncOutbox').delete(`folder:${id}`);
      }
      for (const id of LEGACY_SAMPLE_IDS.notes) {
        void transaction.objectStore('notes').delete(id);
        void transaction.objectStore('syncOutbox').delete(`note:${id}`);
      }
      for (const id of LEGACY_SAMPLE_IDS.reminders) {
        void transaction.objectStore('reminders').delete(id);
        void transaction.objectStore('syncOutbox').delete(`reminder:${id}`);
      }
      for (const id of LEGACY_SAMPLE_IDS.tasks) {
        void transaction.objectStore('tasks').delete(id);
        void transaction.objectStore('syncOutbox').delete(`task:${id}`);
      }

      const settings = transaction.objectStore('settings');
      void settings.get('app').then((current) => current
        ? settings.put({ ...current, schemaVersion: 7 })
        : undefined);
    },
  },
  {
    version: 8,
    migrate(database, transaction) {
      database.createObjectStore('syncMetadata', { keyPath: 'id' });
      const settings = transaction.objectStore('settings');
      void settings.get('app').then((current) => current
        ? settings.put({ ...current, schemaVersion: 8 })
        : undefined);
    },
  },
  {
    version: 9,
    migrate(database, transaction) {
      const legacyStoreNames = database.objectStoreNames as unknown as { contains(name: string): boolean };
      if (legacyStoreNames.contains('attachments')) {
        database.deleteObjectStore('attachments' as never);
      }
      const notes = transaction.objectStore('notes');
      void notes.openCursor().then(async function removeScreenshotReferences(cursor): Promise<void> {
        if (!cursor) return;
        const note = cursor.value;
        const source = note.source && typeof note.source === 'object' ? { ...note.source } : note.source;
        if (source && 'screenshotAttachmentId' in source) {
          delete (source as Record<string, unknown>).screenshotAttachmentId;
          await cursor.update({ ...note, source });
        }
        return cursor.continue().then(removeScreenshotReferences);
      });
      const settings = transaction.objectStore('settings');
      void settings.get('app').then((current) => current
        ? settings.put({ ...current, schemaVersion: 9 })
        : undefined);
    },
  },
];

export function applyMigrations(
  database: IDBPDatabase<MochiDatabaseSchema>,
  oldVersion: number,
  newVersion: number,
  transaction: IDBPTransaction<
    MochiDatabaseSchema,
    ArrayLike<StoreNames<MochiDatabaseSchema>>,
    'versionchange'
  >,
) {
  for (const migration of MIGRATIONS) {
    if (migration.version > oldVersion && migration.version <= newVersion) {
      migration.migrate(database, transaction);
    }
  }
}
