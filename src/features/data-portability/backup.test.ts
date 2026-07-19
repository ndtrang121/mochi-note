import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deleteMochiDatabase, openMochiDatabase, type MochiDatabase } from '../../db/database';
import { createSeedFixtures, seedDatabase } from '../../db/seed';
import { createMochiRepositories } from '../../db/repositories';
import type { Note } from '../../db/models';
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

async function addAttachment() {
  const repositories = createMochiRepositories(database);
  await repositories.attachments.put({
    id: 'attachment-test',
    noteId: 'note-month-plan',
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
    await repositories.tasks.put({ ...task, repeatRule: 'FREQ=WEEKLY' });
    const backup = await createBackup(database);
    await restoreBackup(database, backup, 'replace');
    expect((await repositories.tasks.get(task.id))?.repeatRule).toBe('FREQ=WEEKLY');
  });

  it('rejects malformed, unsupported, and dangling backups', async () => {
    expect(() => parseBackupJson('{"format":"wrong"}')).toThrow('MochiNote');
    const backup = await createBackup(database);
    expect(() => parseBackupJson(JSON.stringify({ ...backup, version: 99 }))).toThrow('99');
    const broken = structuredClone(backup);
    broken.data.notes[0].folderId = 'missing-folder';
    expect(() => parseBackupJson(JSON.stringify(broken))).toThrow('note-');
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
});
