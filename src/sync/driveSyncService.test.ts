import { describe, expect, it, vi } from 'vitest';

import type { SyncSecretRecord } from '../db/syncModels';
import type { SyncSecretRepository } from '../db/repositories';
import type { DriveAppDataClient, DriveAppDataFile } from './driveAppData';
import { DriveSyncService } from './driveSyncService';
import type { DeviceSyncSnapshot, SyncDataSource, SyncDataset, SyncEntityRecord, SyncStateStore } from './syncTypes';

class MemoryDrive implements DriveAppDataClient {
  readonly files = new Map<string, { bytes: Uint8Array; id: string }>();
  deleteFile(fileId: string) {
    for (const [name, file] of this.files) if (file.id === fileId) this.files.delete(name);
    return Promise.resolve();
  }
  downloadFile(fileId: string) {
    const file = Array.from(this.files.values()).find((item) => item.id === fileId);
    return file ? Promise.resolve(file.bytes) : Promise.reject(new Error('Missing file'));
  }
  listFiles(): Promise<DriveAppDataFile[]> {
    return Promise.resolve(Array.from(this.files, ([name, file]) => ({ id: file.id, name })));
  }
  upsertFile(name: string, bytes: Uint8Array) {
    const file = { bytes, id: `id-${name}` };
    this.files.set(name, file);
    return Promise.resolve({ id: file.id, name });
  }
}

class MemorySecrets implements SyncSecretRepository {
  secret?: SyncSecretRecord;
  clear() { this.secret = undefined; return Promise.resolve(); }
  get() { return Promise.resolve(this.secret); }
  put(secret: SyncSecretRecord) { this.secret = secret; return Promise.resolve(); }
}

class MemoryState implements SyncStateStore {
  snapshot?: DeviceSyncSnapshot;
  clear() { this.snapshot = undefined; return Promise.resolve(); }
  get() { return Promise.resolve(this.snapshot); }
  put(snapshot: DeviceSyncSnapshot) { this.snapshot = snapshot; return Promise.resolve(); }
}

class MemorySource implements SyncDataSource {
  applied: SyncEntityRecord[] = [];
  cleared = false;
  constructor(readonly dataset: SyncDataset) {}
  clear() { this.cleared = true; this.dataset.entities = []; return Promise.resolve(); }
  read() { return Promise.resolve(this.dataset); }
  replace(records: SyncEntityRecord[], readBlob: (hash: string) => Promise<Uint8Array>) {
    void readBlob;
    this.applied = records;
    return Promise.resolve();
  }
}

function createAuth() {
  return {
    connect: vi.fn(() => Promise.resolve('token')),
    disconnect: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    invalidateAccessToken: vi.fn(() => Promise.resolve()),
    supportsBackgroundRefresh: true,
  };
}

function createRuntimeStorage() {
  const values = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve({ [key]: values.get(key) })),
    remove: vi.fn((key: string) => { values.delete(key); return Promise.resolve(); }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.entries(items).forEach(([key, value]) => values.set(key, value));
      return Promise.resolve();
    }),
  };
}

function settingsDataset(noteTitle?: string): SyncDataset {
  return {
    blobs: new Map(),
    entities: [
      {
        entityType: 'settings',
        id: 'app',
        value: { id: 'app', layout: 'grid', locale: 'vi', recentColors: [], schemaVersion: 5, theme: 'light', updatedAt: '2026-07-20T00:00:00.000Z' },
      },
      ...(noteTitle ? [{
        entityType: 'note' as const,
        id: 'note-one',
        value: { id: 'note-one', title: noteTitle, updatedAt: '2026-07-20T00:00:00.000Z' },
      }] : []),
    ],
  };
}

function createService(
  drive: MemoryDrive,
  source: MemorySource,
  secrets = new MemorySecrets(),
  deviceId = 'device-a',
  configured = true,
) {
  const runtimeStorage = createRuntimeStorage();
  const auth = createAuth();
  return {
    auth,
    runtimeStorage,
    secrets,
    service: new DriveSyncService({
      auth,
      configured,
      dataSource: source,
      drive,
      now: () => '2026-07-20T01:00:00.000Z',
      runtimeStorage,
      secrets,
      stateStore: new MemoryState(),
      uuid: () => deviceId,
    }),
  };
}

describe('Drive sync lifecycle service', () => {
  it('stays unavailable when the OAuth client is not configured', async () => {
    const { service } = createService(new MemoryDrive(), new MemorySource(settingsDataset()), undefined, 'device-a', false);
    await expect(service.initialize()).resolves.toMatchObject({ status: 'unconfigured' });
    await expect(service.connect()).resolves.toMatchObject({ status: 'unconfigured' });
  });

  it('creates a remote vault, remembers the key, and disconnects without deleting remote data', async () => {
    const drive = new MemoryDrive();
    const { auth, runtimeStorage, secrets, service } = createService(drive, new MemorySource(settingsDataset('From A')));

    await expect(service.connect()).resolves.toMatchObject({ status: 'needs-new-passphrase' });
    await expect(service.submitPassphrase('correct horse battery staple')).resolves.toMatchObject({ status: 'ready' });
    expect(secrets.secret?.masterKey.extractable).toBe(false);
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
    expect(drive.files.has('device-device-a.bin')).toBe(true);

    await service.disconnect();
    expect(auth.disconnect).toHaveBeenCalledOnce();
    expect(secrets.secret).toBeUndefined();
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
    await expect(runtimeStorage.get('google-drive-device-id')).resolves.toEqual({
      'google-drive-device-id': 'device-a',
    });
  });

  it('unlocks an existing vault on a later device and can explicitly reset remote sync files', async () => {
    const drive = new MemoryDrive();
    const first = createService(drive, new MemorySource(settingsDataset('From A')), undefined, 'device-a');
    await first.service.connect();
    await first.service.submitPassphrase('correct horse battery staple');

    const secondSource = new MemorySource(settingsDataset());
    const second = createService(drive, secondSource, undefined, 'device-b');
    await expect(second.service.connect()).resolves.toMatchObject({ status: 'locked' });
    await expect(second.service.submitPassphrase('correct horse battery staple')).resolves.toMatchObject({ status: 'ready' });
    expect(secondSource.applied.find((record) => record.id === 'note-one')?.value).toMatchObject({ title: 'From A' });

    await second.service.resetRemoteVault();
    expect(Array.from(drive.files.keys()).filter((name) => name.startsWith('device-') || name.startsWith('blob-'))).toHaveLength(0);
    const manifestFile = drive.files.get('mochinote-manifest.json');
    expect(manifestFile).toBeDefined();
    expect(JSON.parse(new TextDecoder().decode(manifestFile!.bytes))).toMatchObject({ formatVersion: 2, status: 'revoked', epoch: 1 });
    await expect(first.service.sync()).rejects.toThrow('revoked');
  });

  it('deletes local data only after a successful sync while keeping the Drive vault', async () => {
    const drive = new MemoryDrive();
    const source = new MemorySource(settingsDataset('Local'));
    const { service } = createService(drive, source);

    await expect(service.deleteLocalData()).rejects.toThrow('Sync successfully');
    await service.connect();
    await service.submitPassphrase('correct horse battery staple');
    await service.deleteLocalData();

    expect(source.cleared).toBe(true);
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
    expect(drive.files.has('device-device-a.bin')).toBe(true);
  });

  it('revokes Drive and clears local data when deleting everything', async () => {
    const drive = new MemoryDrive();
    const source = new MemorySource(settingsDataset('Delete all'));
    const { service } = createService(drive, source);
    await service.connect();
    await service.submitPassphrase('correct horse battery staple');

    await service.deleteAllData();

    expect(source.cleared).toBe(true);
    expect(Array.from(drive.files.keys()).filter((name) => name.startsWith('device-') || name.startsWith('blob-'))).toHaveLength(0);
    const manifest = drive.files.get('mochinote-manifest.json');
    expect(JSON.parse(new TextDecoder().decode(manifest!.bytes))).toMatchObject({ epoch: 1, status: 'revoked' });
  });
});
