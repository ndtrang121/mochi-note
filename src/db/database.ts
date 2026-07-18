import { deleteDB, openDB } from 'idb';
import type { IDBPDatabase } from 'idb';

import {
  applyMigrations,
  MOCHI_DATABASE_VERSION,
  type MochiDatabaseSchema,
} from './migrations';

export const MOCHI_DATABASE_NAME = 'mochi-note';

export function openMochiDatabase(databaseName = MOCHI_DATABASE_NAME) {
  return openDB<MochiDatabaseSchema>(databaseName, MOCHI_DATABASE_VERSION, {
    upgrade(database, oldVersion, newVersion) {
      applyMigrations(database, oldVersion, newVersion ?? MOCHI_DATABASE_VERSION);
    },
  });
}

export function deleteMochiDatabase(databaseName = MOCHI_DATABASE_NAME) {
  return deleteDB(databaseName);
}

export type MochiDatabase = IDBPDatabase<MochiDatabaseSchema>;
