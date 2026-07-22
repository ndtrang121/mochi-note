import { deleteMochiDatabase, openMochiDatabase } from '../db/database';
import { createMochiRepositories, createSyncedMochiRepositories } from '../db/repositories';
import type { Folder, Note, Reminder, Settings, Task } from '../db/models';
import { syncUserData } from './sync';

type SyncRecord = Folder | Note | Reminder | Settings | Task;

function shouldImport(guest: SyncRecord, account: SyncRecord | undefined) {
  return !account || guest.updatedAt > account.updatedAt;
}

async function importRecords<TRecord extends SyncRecord>(
  guestRecords: TRecord[],
  accountRecords: TRecord[],
  put: (record: TRecord) => Promise<unknown>,
) {
  const accountById = new Map(accountRecords.map((record) => [record.id, record]));
  for (const record of guestRecords) {
    if (shouldImport(record, accountById.get(record.id))) await put(record);
  }
}

export async function importGuestData(
  guestDatabaseName: string,
  accountDatabaseName: string,
  userId: string,
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
    await importRecords(await guest.folders.list(), await account.folders.list(), (record) => syncedAccount.folders.put(record));
    await importRecords(await guest.notes.list(), await account.notes.list(), (record) => syncedAccount.notes.put(record));
    await importRecords(await guest.tasks.list(), await account.tasks.list(), (record) => syncedAccount.tasks.put(record));
    await importRecords(await guest.reminders.list(), await account.reminders.list(), (record) => syncedAccount.reminders.put(record));

    const guestSettings = await guest.settings.get();
    const accountSettings = await account.settings.get();
    if (guestSettings && shouldImport(guestSettings, accountSettings)) {
      await syncedAccount.settings.put(guestSettings);
    }

    const result = await syncUserData(accountDatabase, userId, deviceId);
    if (result.status === 'idle' && result.pendingCount === 0) {
      guestDatabase.close();
      await deleteMochiDatabase(guestDatabaseName);
    }
  } finally {
    guestDatabase.close();
    accountDatabase.close();
  }
}

