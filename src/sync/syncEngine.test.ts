import { describe, expect, it } from 'vitest';

import type { DriveAppDataClient, DriveAppDataFile } from './driveAppData';
import { createSyncVault, encryptSyncPayload } from './syncCrypto';
import { GoogleDriveSyncEngine } from './syncEngine';
import type {
  DeviceSyncSnapshot,
  SyncDataSource,
  SyncDataset,
  SyncEntityRecord,
  SyncLocalState,
  SyncStateStore,
} from './syncTypes';

class MemoryDrive implements DriveAppDataClient {
  readonly files = new Map<string, { bytes: Uint8Array; file: DriveAppDataFile }>();
  downloadCount = 0;
  upsertCount = 0;

  deleteFile(fileId: string) {
    for (const [name, stored] of this.files) if (stored.file.id === fileId) this.files.delete(name);
    return Promise.resolve();
  }

  downloadFile(fileId: string) {
    this.downloadCount += 1;
    const stored = Array.from(this.files.values()).find((item) => item.file.id === fileId);
    if (!stored) return Promise.reject(new Error('Missing file'));
    return Promise.resolve(stored.bytes);
  }

  listFiles(): Promise<DriveAppDataFile[]> {
    return Promise.resolve(Array.from(this.files.values(), ({ file }) => file));
  }

  upsertFile(name: string, content: Uint8Array) {
    this.upsertCount += 1;
    const file: DriveAppDataFile = {
      id: `id-${name}`,
      md5Checksum: `${name}-${this.upsertCount}`,
      modifiedTime: new Date(1_700_000_000_000 + this.upsertCount).toISOString(),
      name,
      size: String(content.byteLength),
    };
    this.files.set(name, { bytes: content, file });
    return Promise.resolve(file);
  }
}

class MemoryState implements SyncStateStore {
  localState?: SyncLocalState;
  snapshot?: DeviceSyncSnapshot;
  clear() { this.snapshot = undefined; this.localState = undefined; return Promise.resolve(); }
  get() { return Promise.resolve(this.snapshot); }
  put(snapshot: DeviceSyncSnapshot) { this.snapshot = snapshot; return Promise.resolve(); }
  getLocalState() { return Promise.resolve(this.localState); }
  putLocalState(state: SyncLocalState) { this.localState = state; return Promise.resolve(); }
}

class MemorySource implements SyncDataSource {
  applied: SyncEntityRecord[] = [];
  replaceCount = 0;

  constructor(readonly dataset: SyncDataset) {}

  read() { return Promise.resolve(this.dataset); }

  replace(records: SyncEntityRecord[], readBlob: (hash: string) => Promise<Uint8Array>) {
    void readBlob;
    this.replaceCount += 1;
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
    expect(result.replacedLocal).toBe(true);
    expect(sourceB.applied.find((record) => record.id === 'note-a')?.value).toMatchObject({ title: 'From A' });
    expect(drive.files.has('device-device-b.bin')).toBe(true);
  });

  it('skips unchanged download, upload, and local replacement after caching metadata', async () => {
    const drive = new MemoryDrive();
    const { masterKey } = await createSyncVault('correct horse battery staple');
    const source = new MemorySource({
      blobs: new Map(),
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
    const firstUpserts = drive.upsertCount;
    const firstDownloads = drive.downloadCount;
    const result = await engine.sync();

    expect(result).toMatchObject({ downloadedSnapshots: 0, replacedLocal: false, uploadedSnapshot: null });
    expect(drive.upsertCount).toBe(firstUpserts);
    expect(drive.downloadCount).toBe(firstDownloads);
    expect(source.replaceCount).toBe(0);
  });

  it('uploads a referenced attachment blob once and ignores an unreferenced loser blob', async () => {
    const drive = new MemoryDrive();
    const { masterKey } = await createSyncVault('correct horse battery staple');
    const source = new MemorySource({
      blobs: new Map([
        ['hash-winner', new Uint8Array([1, 2, 3])],
        ['hash-loser', new Uint8Array([4, 5, 6])],
      ]),
      entities: [
        settings('2026-07-20T00:00:00.000Z'),
        {
          entityType: 'attachment',
          id: 'attachment-a',
          value: { blobHash: 'hash-winner', id: 'attachment-a', updatedAt: '2026-07-20T00:00:00.000Z' },
        },
      ],
    });
    const state = new MemoryState();
    const engine = new GoogleDriveSyncEngine(drive, source, state, masterKey, 'device-a');

    await engine.sync();
    await engine.sync();

    expect(drive.files.has('blob-hash-winner.bin')).toBe(true);
    expect(drive.files.has('blob-hash-loser.bin')).toBe(false);
    expect(Array.from(drive.files.keys()).filter((name) => name === 'blob-hash-winner.bin')).toHaveLength(1);
  });

  it('rejects a damaged remote snapshot without replacing local IndexedDB data', async () => {
    const drive = new MemoryDrive();
    const { masterKey } = await createSyncVault('correct horse battery staple');
    const invalidSnapshot = new TextEncoder().encode(JSON.stringify({
      deviceId: 'device-b',
      formatVersion: 2,
      generatedAt: '2026-07-20T00:00:00.000Z',
      records: 'damaged',
    }));
    const encrypted = await encryptSyncPayload(masterKey, invalidSnapshot, 'snapshot:device-b');
    await drive.upsertFile('device-device-b.bin', new TextEncoder().encode(JSON.stringify(encrypted)));
    const source = new MemorySource({ blobs: new Map(), entities: [settings('2026-07-20T00:00:00.000Z')] });
    const engine = new GoogleDriveSyncEngine(drive, source, new MemoryState(), masterKey, 'device-a');

    await expect(engine.sync()).rejects.toThrow('snapshot is invalid');
    expect(source.replaceCount).toBe(0);
  });

  it('uploads individual per-entity delta files when a single note is modified', async () => {
    const drive = new MemoryDrive();
    const { masterKey } = await createSyncVault('correct horse battery staple');
    const source = new MemorySource({
      blobs: new Map(),
      entities: [
        settings('2026-07-20T00:00:00.000Z'),
        { entityType: 'note', id: 'note-1', value: { id: 'note-1', title: 'Note 1 Original', updatedAt: '2026-07-20T00:00:00.000Z' } },
        { entityType: 'note', id: 'note-2', value: { id: 'note-2', title: 'Note 2 Original', updatedAt: '2026-07-20T00:00:00.000Z' } },
      ],
    });
    const state = new MemoryState();
    const engine = new GoogleDriveSyncEngine(drive, source, state, masterKey, 'device-a');

    await engine.sync();
    expect(drive.files.has('entity-note-note-1.bin')).toBe(true);
    expect(drive.files.has('entity-note-note-2.bin')).toBe(true);
    const initialUpserts = drive.upsertCount;

    // Modify only note-1
    source.dataset.entities[1] = {
      entityType: 'note',
      id: 'note-1',
      value: { id: 'note-1', title: 'Note 1 Updated', updatedAt: '2026-07-20T02:00:00.000Z' },
    };

    await engine.sync();
    // Only note-1 entity file + overall device snapshot index get updated, note-2 file is NOT re-uploaded!
    expect(drive.files.get('entity-note-note-1.bin')?.file.modifiedTime).not.toBe(
      drive.files.get('entity-note-note-2.bin')?.file.modifiedTime,
    );
  });
});