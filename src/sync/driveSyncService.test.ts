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
    getAccountEmail: vi.fn(() => Promise.resolve('user@example.com')),
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

  it('skips fetching account email during initialize when email is already cached', async () => {
    const { auth, runtimeStorage, service } = createService(new MemoryDrive(), new MemorySource(settingsDataset()));
    await runtimeStorage.set({ 'google-drive-device-id': 'device-a', 'google-drive-account-email': 'cached@example.com' });

    await expect(service.initialize()).resolves.toMatchObject({ accountEmail: 'cached@example.com', status: 'ready' });
    expect(auth.getAccountEmail).not.toHaveBeenCalled();
  });

  it('disconnects only after syncing and clearing local connection data', async () => {
    const drive = new MemoryDrive();
    const source = new MemorySource(settingsDataset('From A'));
    const { auth, runtimeStorage, secrets, service } = createService(drive, source);

    await expect(service.connect()).resolves.toMatchObject({ accountEmail: 'user@example.com', status: 'ready' });
    expect(secrets.secret).toBeUndefined();
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
    expect(drive.files.has('device-device-a.bin')).toBe(true);

    await service.disconnect();
    expect(auth.disconnect).toHaveBeenCalledOnce();
    expect(secrets.secret).toBeUndefined();
    expect(source.cleared).toBe(true);
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
    await expect(runtimeStorage.get('google-drive-device-id')).resolves.toEqual({
      'google-drive-device-id': undefined,
    });
  });

  it('recovers from a deleted remote manifest by rebuilding from local data', async () => {
    const drive = new MemoryDrive();
    const first = createService(drive, new MemorySource(settingsDataset('From A')), undefined, 'device-a');
    await first.service.connect();
    drive.files.delete('mochinote-manifest.json');

    await expect(first.service.sync()).rejects.toThrow('Dữ liệu trên thiết bị này vẫn an toàn');
    await expect(first.service.rebuildRemoteFromLocal()).resolves.toMatchObject({ status: 'ready' });
    const manifestFile = drive.files.get('mochinote-manifest.json');
    expect(JSON.parse(new TextDecoder().decode(manifestFile!.bytes))).toMatchObject({
      schemaVersion: 3,
      generation: 2,
      entities: { notes: { 'note-one': { title: 'From A' } } },
    });
  });

  it('deletes local data only after a successful sync while keeping the Drive vault', async () => {
    const drive = new MemoryDrive();
    const source = new MemorySource(settingsDataset('Local'));
    const { auth, service } = createService(drive, source);

    await expect(service.deleteLocalData()).rejects.toThrow('Sync successfully');
    await service.connect();
    await expect(service.deleteLocalData()).resolves.toMatchObject({ status: 'ready' });

    expect(auth.disconnect).not.toHaveBeenCalled();
    expect(source.cleared).toBe(false);
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
    expect(drive.files.has('device-device-a.bin')).toBe(true);
  });

  it('clears all data while keeping an empty connected Drive generation', async () => {
    const drive = new MemoryDrive();
    const source = new MemorySource(settingsDataset('Delete all'));
    const { service } = createService(drive, source);
    await service.connect();

    await expect(service.deleteAllData()).resolves.toMatchObject({ accountEmail: 'user@example.com', status: 'ready' });

    expect(source.cleared).toBe(true);
    expect(Array.from(drive.files.keys()).filter((name) => name.startsWith('device-'))).toHaveLength(1);
    expect(drive.files.has('mochinote-manifest.json')).toBe(true);
  });

  it('clears a stale device when it observes a newer empty generation', async () => {
    const drive = new MemoryDrive();
    const first = createService(drive, new MemorySource(settingsDataset('From A')), undefined, 'device-a');
    const staleSource = new MemorySource(settingsDataset('From B'));
    const stale = createService(drive, staleSource, undefined, 'device-b');

    await first.service.connect();
    await stale.service.connect();
    await stale.service.sync();
    await first.service.deleteAllData();
    await stale.service.sync();

    expect(staleSource.cleared).toBe(true);
    const manifestFile = drive.files.get('mochinote-manifest.json');
    expect(JSON.parse(new TextDecoder().decode(manifestFile!.bytes))).toMatchObject({
      generation: 2,
      entities: { notes: {} },
    });
  });
});
