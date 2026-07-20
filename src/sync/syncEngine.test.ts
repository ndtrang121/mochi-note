import { describe, expect, it } from 'vitest';

import type { DriveAppDataClient, DriveAppDataFile } from './driveAppData';
import { createSyncVault } from './syncCrypto';
import { GoogleDriveSyncEngine } from './syncEngine';
import type {
  DeviceSyncSnapshot,
  SyncDataSource,
  SyncDataset,
  SyncEntityRecord,
  SyncStateStore,
} from './syncTypes';

class MemoryDrive implements DriveAppDataClient {
  readonly files = new Map<string, { bytes: Uint8Array; id: string }>();
  upsertCount = 0;

  deleteFile(fileId: string) {
    for (const [name, file] of this.files) if (file.id === fileId) this.files.delete(name);
    return Promise.resolve();
  }

  downloadFile(fileId: string) {
    const file = Array.from(this.files.values()).find((item) => item.id === fileId);
    if (!file) return Promise.reject(new Error('Missing file'));
    return Promise.resolve(file.bytes);
  }

  listFiles(): Promise<DriveAppDataFile[]> {
    return Promise.resolve(Array.from(this.files, ([name, file]) => ({ id: file.id, name })));
  }

  upsertFile(name: string, content: Uint8Array) {
    this.upsertCount += 1;
    const file = { bytes: content, id: `id-${name}` };
    this.files.set(name, file);
    return Promise.resolve({ id: file.id, name });
  }
}

class MemoryState implements SyncStateStore {
  snapshot?: DeviceSyncSnapshot;
  clear() { this.snapshot = undefined; return Promise.resolve(); }
  get() { return Promise.resolve(this.snapshot); }
  put(snapshot: DeviceSyncSnapshot) { this.snapshot = snapshot; return Promise.resolve(); }
}

class MemorySource implements SyncDataSource {
  applied: SyncEntityRecord[] = [];

  constructor(readonly dataset: SyncDataset) {}

  read() { return Promise.resolve(this.dataset); }

  replace(records: SyncEntityRecord[], readBlob: (hash: string) => Promise<Uint8Array>) {
    void readBlob;
    this.applied = records;
    this.dataset.entities = records
      .filter((record) => !record.deleted && record.value)
      .map((record) => ({ entityType: record.entityType, id: record.id, value: record.value! }));
    return Promise.resolve();
  }
}

function settings(updatedAt: string) {
  return {
    entityType: 'settings' as const,
    id: 'app',
    value: { id: 'app', layout: 'grid', locale: 'vi', recentColors: [], schemaVersion: 5, theme: 'light', updatedAt },
  };
}

describe('Google Drive sync engine', () => {
  it('delivers an encrypted snapshot to a device that comes online later', async () => {
    const drive = new MemoryDrive();
    const { masterKey } = await createSyncVault('correct horse battery staple');
    const sourceA = new MemorySource({
      blobs: new Map(),
      entities: [
        settings('2026-07-20T01:00:00.000Z'),
        { entityType: 'note', id: 'note-a', value: { id: 'note-a', title: 'From A', updatedAt: '2026-07-20T01:00:00.000Z' } },
      ],
    });
    await new GoogleDriveSyncEngine(
      drive,
      sourceA,
      new MemoryState(),
      masterKey,
      'device-a',
      () => '2026-07-20T01:00:00.000Z',
    ).sync();

    const sourceB = new MemorySource({
      blobs: new Map(),
      entities: [settings('2026-07-20T00:00:00.000Z')],
    });
    const result = await new GoogleDriveSyncEngine(
      drive,
      sourceB,
      new MemoryState(),
      masterKey,
      'device-b',
      () => '2026-07-20T02:00:00.000Z',
    ).sync();

    expect(result.downloadedSnapshots).toBe(1);
    expect(sourceB.applied.find((record) => record.id === 'note-a')?.value).toMatchObject({ title: 'From A' });
    expect(drive.files.has('device-device-b.bin')).toBe(true);
  });

  it('uploads attachment blobs once by content hash', async () => {
    const drive = new MemoryDrive();
    const { masterKey } = await createSyncVault('correct horse battery staple');
    const source = new MemorySource({
      blobs: new Map([['hash-one', new Uint8Array([1, 2, 3])]]),
      entities: [settings('2026-07-20T00:00:00.000Z')],
    });
    const state = new MemoryState();
    const engine = new GoogleDriveSyncEngine(
      drive,
      source,
      state,
      masterKey,
      'device-a',
      () => '2026-07-20T01:00:00.000Z',
    );

    await engine.sync();
    const firstCount = drive.upsertCount;
    await engine.sync();

    expect(drive.files.has('blob-hash-one.bin')).toBe(true);
    expect(drive.upsertCount).toBe(firstCount + 1);
  });
});
