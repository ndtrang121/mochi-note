import 'fake-indexeddb/auto';

import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteMochiDatabase,
  openMochiDatabase,
  type MochiDatabase,
} from './database';
import { createMochiRepositories, createSyncedMochiRepositories } from './repositories';
import { createSeedFixtures, seedDatabase } from './seed';
import { applyMigrations, type MochiDatabaseSchema } from './migrations';
import type { Folder, Note } from './models';

let database: MochiDatabase;
let databaseCounter = 0;
let databaseName = '';

beforeEach(async () => {
  databaseCounter += 1;
  databaseName = `mochi-note-test-${databaseCounter}`;
  database = await openMochiDatabase(databaseName);
});

afterEach(async () => {
  database.close();
  await deleteMochiDatabase(databaseName);
});

describe('MochiNote IndexedDB', () => {
  it('applies the initial migration with every durable store and query index', () => {
    expect(Array.from(database.objectStoreNames)).toEqual([
      'attachments',
      'folders',
      'notes',
      'reminders',
      'settings',
      'syncCursors',
      'syncOutbox',
      'tasks',
    ]);

    const transaction = database.transaction(
      ['attachments', 'folders', 'notes', 'reminders', 'tasks'],
      'readonly',
    );

    expect(Array.from(transaction.objectStore('folders').indexNames)).toEqual([
      'by-name',
      'by-parent',
      'by-position',
    ]);
    expect(Array.from(transaction.objectStore('notes').indexNames)).toEqual([
      'by-folder',
      'by-updated',
    ]);
    expect(Array.from(transaction.objectStore('reminders').indexNames)).toEqual([
      'by-owner',
      'by-scheduled',
    ]);
  });

  it('upgrades version-one folders with a root parent and hierarchy index', async () => {
    const legacyDatabaseName = `${databaseName}-legacy`;
    const legacyDatabase = await openDB<MochiDatabaseSchema>(legacyDatabaseName, 1, {
      upgrade(upgradeDatabase, _oldVersion, _newVersion, transaction) {
        applyMigrations(upgradeDatabase, 0, 1, transaction);
      },
    });
    const legacyFolder: Partial<Folder> = {
      ...createSeedFixtures().folders[0],
      id: 'folder-user-legacy',
    };
    const legacyNote: Partial<Note> = {
      ...createSeedFixtures().notes[0],
      folderId: 'folder-user-legacy',
      id: 'note-user-legacy',
    };
    delete legacyFolder.parentId;
    delete legacyNote.tags;
    delete legacyNote.deletedAt;
    await legacyDatabase.put('folders', legacyFolder as Folder);
    await legacyDatabase.put('notes', legacyNote as Note);
    await legacyDatabase.put('settings', {
      ...createSeedFixtures().settings,
      schemaVersion: 2,
    });
    legacyDatabase.close();

    const upgradedDatabase = await openMochiDatabase(legacyDatabaseName);
    expect(upgradedDatabase.version).toBe(7);
    await expect(
      createMochiRepositories(upgradedDatabase).folders.get('folder-user-legacy'),
    ).resolves.toMatchObject({
      parentId: null,
    });
    expect(
      Array.from(upgradedDatabase.transaction('folders').store.indexNames),
    ).toContain('by-parent');
    await expect(
      createMochiRepositories(upgradedDatabase).notes.get('note-user-legacy'),
    ).resolves.toMatchObject({ deletedAt: null, tags: [] });
    await expect(
      createMochiRepositories(upgradedDatabase).settings.get(),
    ).resolves.toMatchObject({ schemaVersion: 7 });
    upgradedDatabase.close();
    await deleteMochiDatabase(legacyDatabaseName);
  });

  it('creates deterministic fixtures and seeds a new database only once', async () => {
    const firstFixtures = createSeedFixtures();
    const secondFixtures = createSeedFixtures();

    expect(secondFixtures).toEqual(firstFixtures);
    await expect(seedDatabase(database, firstFixtures)).resolves.toBe(true);
    await expect(seedDatabase(database, secondFixtures)).resolves.toBe(false);

    const repositories = createMochiRepositories(database);
    await expect(repositories.folders.list()).resolves.toHaveLength(4);
    await expect(repositories.notes.list()).resolves.toHaveLength(4);
    await expect(repositories.tasks.list()).resolves.toHaveLength(5);
    await expect(repositories.settings.get()).resolves.toMatchObject({
      id: 'app',
      locale: firstFixtures.settings.locale,
      schemaVersion: 7,
    });
  });

  it('removes retired sample records and queued uploads from an existing account database', async () => {
    const legacyDatabaseName = `${databaseName}-sample-cleanup`;
    const legacyDatabase = await openDB<MochiDatabaseSchema>(legacyDatabaseName, 6, {
      upgrade(upgradeDatabase, _oldVersion, _newVersion, transaction) {
        applyMigrations(upgradeDatabase, 0, 6, transaction);
      },
    });
    const fixtures = createSeedFixtures();
    await seedDatabase(legacyDatabase, {
      ...fixtures,
      settings: { ...fixtures.settings, schemaVersion: 6 },
    });
    await legacyDatabase.put('notes', {
      ...fixtures.notes[0],
      folderId: null,
      id: 'note-user-created',
      title: 'User-created note',
    });
    await legacyDatabase.put('syncOutbox', {
      clientUpdatedAt: fixtures.notes[0].updatedAt,
      deviceId: 'legacy-device',
      entityId: fixtures.notes[0].id,
      entityType: 'note',
      id: `note:${fixtures.notes[0].id}`,
      nextAttemptAt: null,
      operation: 'upsert',
      payload: { ...fixtures.notes[0] },
      retryCount: 0,
    });
    await legacyDatabase.put('syncOutbox', {
      clientUpdatedAt: fixtures.notes[0].updatedAt,
      deviceId: 'legacy-device',
      entityId: 'note-user-created',
      entityType: 'note',
      id: 'note:note-user-created',
      nextAttemptAt: null,
      operation: 'upsert',
      payload: { ...fixtures.notes[0], id: 'note-user-created' },
      retryCount: 0,
    });
    legacyDatabase.close();

    const upgradedDatabase = await openMochiDatabase(legacyDatabaseName);
    try {
      const repositories = createMochiRepositories(upgradedDatabase);
      await expect(repositories.folders.list()).resolves.toEqual([]);
      await expect(repositories.notes.list()).resolves.toMatchObject([
        { id: 'note-user-created', title: 'User-created note' },
      ]);
      await expect(repositories.tasks.list()).resolves.toEqual([]);
      await expect(upgradedDatabase.getAllKeys('syncOutbox')).resolves.toEqual([
        'note:note-user-created',
      ]);
      await expect(repositories.settings.get()).resolves.toMatchObject({ schemaVersion: 7 });
    } finally {
      upgradedDatabase.close();
      await deleteMochiDatabase(legacyDatabaseName);
    }
  });

  it('exposes typed domain queries for folders, notes, tasks, and reminders', async () => {
    await seedDatabase(database);
    const repositories = createMochiRepositories(database);

    const folders = await repositories.folders.listOrdered();
    expect(folders.map((folder) => folder.name)).toEqual([
      'Công việc',
      'Học tập',
      'Cá nhân',
      'Ý tưởng',
    ]);
    await expect(repositories.folders.listByParent(null)).resolves.toHaveLength(4);

    const recentNotes = await repositories.notes.listRecent(2);
    expect(recentNotes.map((note) => note.id)).toEqual([
      'note-month-plan',
      'note-content-ideas',
    ]);
    await expect(repositories.notes.listByFolder('folder-work')).resolves.toHaveLength(2);
    await expect(repositories.notes.search('y tuong')).resolves.toMatchObject([
      { id: 'note-content-ideas' },
    ]);
    await expect(repositories.notes.search('khach hang')).resolves.toMatchObject([
      { id: 'note-client-meeting' },
    ]);
    await expect(repositories.tasks.listByDate('2026-07-19')).resolves.toHaveLength(5);
    await expect(repositories.reminders.listDue('2026-07-21T00:00:00.000Z')).resolves.toMatchObject(
      [{ id: 'reminder-client-meeting' }],
    );
    await expect(
      repositories.reminders.listForOwner('note', 'note-client-meeting'),
    ).resolves.toHaveLength(1);
  });

  it('supports repository create, update, and delete operations', async () => {
    const fixtures = createSeedFixtures();
    const repositories = createMochiRepositories(database);
    const note = {
      ...fixtures.notes[0],
      id: 'note-repository-test',
      title: 'Bản nháp repository',
    };

    await repositories.notes.put(note);
    await expect(repositories.notes.get(note.id)).resolves.toMatchObject({
      id: note.id,
      title: 'Bản nháp repository',
    });

    await repositories.notes.put({ ...note, title: 'Đã cập nhật' });
    await expect(repositories.notes.get(note.id)).resolves.toMatchObject({
      title: 'Đã cập nhật',
    });

    await repositories.notes.delete(note.id);
    await expect(repositories.notes.get(note.id)).resolves.toBeUndefined();
  });

  it('batches synced writes and deletes into one outbox transaction per entity type', async () => {
    const fixtures = createSeedFixtures();
    const onMutation = vi.fn();
    const repositories = createSyncedMochiRepositories(database, { deviceId: 'device-a', onMutation });
    const notes = fixtures.notes.slice(0, 2).map((note, index) => ({
      ...note,
      id: `batched-note-${index}`,
      updatedAt: `2026-07-23T00:00:0${index}.000Z`,
    }));

    await repositories.notes.putMany(notes);

    expect(onMutation).toHaveBeenCalledOnce();
    await expect(database.getAllKeys('syncOutbox')).resolves.toEqual([
      'note:batched-note-0',
      'note:batched-note-1',
    ]);

    await repositories.notes.deleteMany(notes.map((note) => note.id));

    expect(onMutation).toHaveBeenCalledTimes(2);
    await expect(database.getAll('notes')).resolves.toEqual([]);
    await expect(database.getAll('syncOutbox')).resolves.toMatchObject([
      { id: 'note:batched-note-0', operation: 'delete' },
      { id: 'note:batched-note-1', operation: 'delete' },
    ]);
  });

  it('keeps trashed notes out of active queries and lists them for recovery', async () => {
    await seedDatabase(database);
    const repositories = createMochiRepositories(database);
    const note = createSeedFixtures().notes[0];
    await repositories.notes.put({
      ...note,
      deletedAt: '2026-07-19T13:00:00.000Z',
      updatedAt: '2026-07-19T13:00:00.000Z',
    });

    await expect(repositories.notes.listDeleted()).resolves.toMatchObject([
      { id: note.id, deletedAt: '2026-07-19T13:00:00.000Z' },
    ]);
    expect((await repositories.notes.listRecent()).map((item) => item.id)).not.toContain(note.id);
    await expect(repositories.notes.search('kế hoạch tháng 6')).resolves.toEqual([]);
  });

  it('persists reminder create, update, owner lookup, and delete operations', async () => {
    const fixtures = createSeedFixtures();
    const repositories = createMochiRepositories(database);
    const reminder = {
      ...fixtures.reminders[0],
      id: 'reminder-repository-test',
      ownerId: fixtures.notes[0].id,
      scheduledAt: '2099-01-02T02:30:00.000Z',
    };

    await repositories.reminders.put(reminder);
    await expect(
      repositories.reminders.listForOwner('note', fixtures.notes[0].id),
    ).resolves.toMatchObject([{ id: reminder.id, enabled: true }]);

    await repositories.reminders.put({
      ...reminder,
      repeatRule: 'FREQ=DAILY',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    await expect(repositories.reminders.get(reminder.id)).resolves.toMatchObject({
      repeatRule: 'FREQ=DAILY',
    });

    await repositories.reminders.delete(reminder.id);
    await expect(repositories.reminders.get(reminder.id)).resolves.toBeUndefined();
  });
});
