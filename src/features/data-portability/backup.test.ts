import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../../db/database';
import { createSeedFixtures, seedDatabase } from '../../db/seed';
import { createMochiRepositories, createSyncedMochiRepositories } from '../../db/repositories';
import type { Note, Task } from '../../db/models';
import {
  backupPreview,
  createBackup,
  parseBackupJson,
  restoreBackup,
} from './backup';

let database: MochiDatabase;
let databaseName = '';
let counter = 0;

beforeEach(async () => {
  counter += 1;
  databaseName = `mochi-portability-${counter}`;
  database = await openMochiDatabase(databaseName);
  await seedDatabase(database);
});

afterEach(async () => {
  database.close();
  await deleteMochiDatabase(databaseName);
});

async function addAttachment(noteId = 'note-month-plan') {
  const repositories = createMochiRepositories(database);
  await repositories.attachments.put({
    id: 'attachment-test',
    noteId,
    kind: 'file',
    fileName: 'hello.txt',
    mimeType: 'text/plain',
    blob: new Blob(['hello MochiNote'], { type: 'text/plain' }),
    size: 15,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-19T10:00:00.000Z',
  });
}

describe('MochiNote data portability', () => {
  it('exports and restores attachments without losing binary data', async () => {
    await addAttachment();
    const backup = await createBackup(database);
    expect(backupPreview(backup)).toMatchObject({ notes: 4, folders: 4, attachments: 1 });
    expect(backup.data.attachments[0].dataBase64).toBeTruthy();

    await restoreBackup(database, backup, 'replace');
    const attachment = await createMochiRepositories(database).attachments.get('attachment-test');
    expect(attachment?.blob).toBeTruthy();
    expect(attachment?.fileName).toBe('hello.txt');
  });

  it('round-trips recurring task rules', async () => {
    const repositories = createMochiRepositories(database);
    const task = createSeedFixtures().tasks[0];
    await repositories.tasks.put({
      ...task,
      completedDates: ['2026-07-26'],
      recurrenceSeriesId: task.id,
      repeatRule: 'FREQ=WEEKLY',
    });
    const backup = await createBackup(database);
    await restoreBackup(database, backup, 'replace');
    expect(await repositories.tasks.get(task.id)).toMatchObject({
      completedDates: ['2026-07-26'],
      recurrenceSeriesId: task.id,
      repeatRule: 'FREQ=WEEKLY',
    });
  });

  it('normalizes legacy nullable task recurrence IDs during export', async () => {
    const repositories = createMochiRepositories(database);
    const task = createSeedFixtures().tasks[0];
    await repositories.tasks.put({
      ...task,
      recurrenceSeriesId: null,
    } as unknown as Task);

    const backup = await createBackup(database);
    const exportedTask = backup.data.tasks.find(({ id }) => id === task.id);

    expect(exportedTask).not.toHaveProperty('recurrenceSeriesId');
  });

  it('round-trips archived note state', async () => {
    const repositories = createMochiRepositories(database);
    const note = createSeedFixtures().notes[0];
    const archivedAt = '2026-07-19T12:00:00.000Z';
    await repositories.notes.put({ ...note, archivedAt });
    const backup = await createBackup(database);
    await restoreBackup(database, backup, 'replace');
    expect((await repositories.notes.get(note.id))?.archivedAt).toBe(archivedAt);
  });

  it('round-trips trashed notes while retaining reminders and attachments', async () => {
    await addAttachment('note-client-meeting');
    const repositories = createMochiRepositories(database);
    const note = await repositories.notes.get('note-client-meeting');
    if (!note) throw new Error('Missing seeded note');
    const deletedAt = '2026-07-19T13:00:00.000Z';
    await repositories.notes.put({ ...note, deletedAt });
    const backup = await createBackup(database);
    await restoreBackup(database, backup, 'replace');

    expect((await repositories.notes.get(note.id))?.deletedAt).toBe(deletedAt);
    expect(await repositories.attachments.get('attachment-test')).toBeTruthy();
    expect(await repositories.reminders.get('reminder-client-meeting')).toBeTruthy();
  });

  it('round-trips note tags and upgrades schema-two backups without tags', async () => {
    const repositories = createMochiRepositories(database);
    const note = createSeedFixtures().notes[0];
    await repositories.notes.put({ ...note, tags: ['Phát hành', 'QA'] });
    const backup = await createBackup(database);
    await restoreBackup(database, backup, 'replace');
    expect((await repositories.notes.get(note.id))?.tags).toEqual(['Phát hành', 'QA']);

    const legacy = structuredClone(backup) as unknown as {
      databaseSchemaVersion: number;
      data: {
        notes: Array<{ deletedAt?: string | null; tags?: string[] }>;
        settings: { schemaVersion: number };
      };
    };
    legacy.databaseSchemaVersion = 2;
    legacy.data.settings.schemaVersion = 2;
    for (const legacyNote of legacy.data.notes) {
      delete legacyNote.tags;
      delete legacyNote.deletedAt;
    }
    const upgraded = parseBackupJson(JSON.stringify(legacy));
    expect(upgraded.databaseSchemaVersion).toBe(7);
    expect(upgraded.data.notes.every((item) => item.tags.length === 0)).toBe(true);
    expect(upgraded.data.notes.every((item) => item.deletedAt === null)).toBe(true);
  });

  it('rejects malformed, unsupported, and dangling backups', async () => {
    expect(() => parseBackupJson('{"format":"wrong"}')).toThrow('MochiNote');
    const backup = await createBackup(database);
    expect(() => parseBackupJson(JSON.stringify({ ...backup, version: 99 }))).toThrow('99');
    const broken = structuredClone(backup);
    broken.data.notes[0].folderId = 'missing-folder';
    expect(() => parseBackupJson(JSON.stringify(broken))).toThrow('note-');
    const duplicateTags = structuredClone(backup);
    duplicateTags.data.notes[0].tags = ['QA', 'QA'];
    expect(() => parseBackupJson(JSON.stringify(duplicateTags))).toThrow('duplicate tags');
  });

  it('merges records while preserving unrelated local data', async () => {
    const backup = await createBackup(database);
    const extra: Note = { ...createSeedFixtures().notes[0], id: 'note-local-only', title: 'Local only' };
    await createMochiRepositories(database).notes.put(extra);

    await restoreBackup(database, backup, 'merge');
    const notes = await createMochiRepositories(database).notes.list();
    expect(notes.map((note) => note.id)).toContain('note-local-only');
    expect(notes).toHaveLength(5);
  });

  it('replaces stale records in one restore operation', async () => {
    const backup = await createBackup(database);
    const repositories = createMochiRepositories(database);
    await repositories.tasks.put({ ...createSeedFixtures().tasks[0], id: 'task-stale' });
    await restoreBackup(database, backup, 'replace');
    expect(await repositories.tasks.get('task-stale')).toBeUndefined();
  });

  it('does not mutate data when validation fails', async () => {
    const repositories = createMochiRepositories(database);
    const before = await repositories.notes.list();
    const invalid = await createBackup(database);
    invalid.data.notes[0].folderId = 'missing-folder';
    await expect(restoreBackup(database, invalid, 'replace')).rejects.toThrow();
    expect(await repositories.notes.list()).toEqual(before);
  });
  it('accepts backups from every released schema version', async () => {
    const current = await createBackup(database);

    for (const schemaVersion of [2, 3, 4, 5, 6]) {
      const historical = structuredClone(current);
      historical.databaseSchemaVersion = schemaVersion;
      historical.data.settings.schemaVersion = schemaVersion;
      const parsed = parseBackupJson(JSON.stringify(historical));
      expect(parsed.databaseSchemaVersion).toBe(7);
    }
  });
  it('queues restored rows and replacement tombstones for cloud sync', async () => {
    const backup = await createBackup(database);
    const repositories = createMochiRepositories(database);
    const localOnly: Note = {
      ...createSeedFixtures().notes[0],
      id: 'note-local-only-before-restore',
      title: 'Remove during restore',
    };
    await repositories.notes.put(localOnly);

    const syncedRepositories = createSyncedMochiRepositories(database, { deviceId: 'restore-device' });
    await restoreBackup(database, backup, 'replace', syncedRepositories);

    const outbox = await database.getAll('syncOutbox');
    expect(outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityId: localOnly.id,
        entityType: 'note',
        operation: 'delete',
      }),
      expect.objectContaining({
        entityId: backup.data.notes[0].id,
        entityType: 'note',
        operation: 'upsert',
      }),
    ]));
    const restoredNote = await repositories.notes.get(backup.data.notes[0].id);
    expect(restoredNote).toBeDefined();
    expect(restoredNote!.updatedAt > backup.data.notes[0].updatedAt).toBe(true);
  });
});
