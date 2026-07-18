import type { DBSchema, IDBPDatabase } from 'idb';

import type { Attachment, Folder, Note, Reminder, Settings, Task } from './models';

export const MOCHI_DATABASE_VERSION = 1;

export interface MochiDatabaseSchema extends DBSchema {
  attachments: {
    indexes: {
      'by-note': string;
    };
    key: string;
    value: Attachment;
  };
  folders: {
    indexes: {
      'by-name': string;
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
}

interface DatabaseMigration {
  migrate: (database: IDBPDatabase<MochiDatabaseSchema>) => void;
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

      const attachments = database.createObjectStore('attachments', { keyPath: 'id' });
      attachments.createIndex('by-note', 'noteId');

      database.createObjectStore('settings', { keyPath: 'id' });
    },
  },
];

export function applyMigrations(
  database: IDBPDatabase<MochiDatabaseSchema>,
  oldVersion: number,
  newVersion: number,
) {
  for (const migration of MIGRATIONS) {
    if (migration.version > oldVersion && migration.version <= newVersion) {
      migration.migrate(database);
    }
  }
}
