import { deleteMochiDatabase, openMochiDatabase } from '../db/database';
import { createMochiRepositories, createSyncedMochiRepositories } from '../db/repositories';
import type { Attachment, Folder, Note, Reminder, Settings, Task } from '../db/models';

type SyncRecord = Attachment | Folder | Note | Reminder | Settings | Task;

function shouldImport(guest: SyncRecord, account: SyncRecord | undefined) {
  return !account || guest.updatedAt > account.updatedAt;
}

async function importRecords<TRecord extends SyncRecord>(
  guestRecords: TRecord[],
  accountRecords: TRecord[],
  putMany: (records: TRecord[]) => Promise<unknown>,
) {
  const accountById = new Map(accountRecords.map((record) => [record.id, record]));
  const recordsToImport = guestRecords.filter((record) => shouldImport(record, accountById.get(record.id)));
  await putMany(recordsToImport);
}

export async function importGuestData(
  guestDatabaseName: string,
  accountDatabaseName: string,
  deviceId: string,
) {
  if (guestDatabaseName === accountDatabaseName) return;
  const guestDatabase = await openMochiDatabase(guestDatabaseName);
  const accountDatabase = await openMochiDatabase(accountDatabaseName);

  try {
    const guest = createMochiRepositories(guestDatabase);
    const account = createMochiRepositories(accountDatabase);
    const syncedAccount = createSyncedMochiRepositories(accountDatabase, { deviceId });

    // Merge by stable ID; the server trigger resolves any cloud conflict with the same LWW rule.
    // Attachments remain device-local, but move with the guest data into the account database.
    await importRecords(await guest.attachments.list(), await account.attachments.list(), (records) => account.attachments.putMany(records));
    await importRecords(await guest.folders.list(), await account.folders.list(), (records) => syncedAccount.folders.putMany(records));
    await importRecords(await guest.notes.list(), await account.notes.list(), (records) => syncedAccount.notes.putMany(records));
    await importRecords(await guest.tasks.list(), await account.tasks.list(), (records) => syncedAccount.tasks.putMany(records));
    await importRecords(await guest.reminders.list(), await account.reminders.list(), (records) => syncedAccount.reminders.putMany(records));

    const guestSettings = await guest.settings.get();
    const accountSettings = await account.settings.get();
    if (guestSettings && shouldImport(guestSettings, accountSettings)) {
      await syncedAccount.settings.put(guestSettings);
    }

    // The account database and its outbox are durable. Background sync starts after
    // the provider switches to this database, so the guest copy can now be removed.
    guestDatabase.close();
    await deleteMochiDatabase(guestDatabaseName);
  } finally {
    guestDatabase.close();
    accountDatabase.close();
  }
}

export async function hasGuestData(databaseName: string) {
  const database = await openMochiDatabase(databaseName);
  try {
    const counts = await Promise.all([
      database.count('attachments'),
      database.count('folders'),
      database.count('notes'),
      database.count('reminders'),
      database.count('tasks'),
    ]);
    return counts.some((count) => count > 0);
  } finally {
    database.close();
  }
}

