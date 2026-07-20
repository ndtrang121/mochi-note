import type { MochiDatabase } from '../db/database';
import { createMochiRepositories, type SyncSecretRepository } from '../db/repositories';
import { MochiDatabaseSyncDataSource } from './databaseSyncSource';
import { GoogleDriveAppDataClient, type DriveAppDataClient } from './driveAppData';
import { createDriveAuthClient, DriveAuthRequiredError, type DriveAuthClient } from './driveAuth';
import {
  createRevokedSyncManifest,
  createSyncVault,
  decryptSyncPayload,
  migrateSyncManifest,
  unlockSyncVault,
  type EncryptedSyncPayload,
  type RemoteSyncManifest,
} from './syncCrypto';
import { GoogleDriveSyncEngine, type SyncRunResult } from './syncEngine';
import { IndexedDbSyncStateStore } from './syncStateStore';
import type { SyncDataSource, SyncFailureKind, SyncManifest, SyncRevision, SyncStateStore } from './syncTypes';

const MANIFEST_FILE_NAME = 'mochinote-manifest.json';
const LAST_SYNCED_AT_KEY = 'google-drive-last-synced-at';
const DEVICE_ID_KEY = 'google-drive-device-id';

export type DriveSyncStatus =
  | 'authorizing'
  | 'disconnected'
  | 'locked'
  | 'needs-new-passphrase'
  | 'remote-missing'
  | 'error'
  | 'ready'
  | 'syncing'
  | 'unconfigured';

export type DriveSyncStableStatus = Exclude<DriveSyncStatus, 'authorizing' | 'syncing'>;

export interface DriveSyncViewState {
  canDeleteAll: boolean;
  canDeleteLocal: boolean;
  error: string | null;
  errorKind?: SyncFailureKind;
  lastResult: SyncRunResult | null;
  lastStableStatus: DriveSyncStableStatus;
  lastSyncedAt: string | null;
  legacyDevices: string[];
  revisions: SyncRevision[];
  status: DriveSyncStatus;
  supportsBackgroundRefresh: boolean;
}

interface RuntimeStorage {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface DriveSyncServiceDependencies {
  auth: DriveAuthClient;
  configured: boolean;
  dataSource: SyncDataSource;
  drive: DriveAppDataClient;
  now?: () => string;
  runtimeStorage: RuntimeStorage;
  secrets: SyncSecretRepository;
  stateStore: SyncStateStore;
  uuid?: () => string;
}

export class DriveSyncService {
  private lastResult: SyncRunResult | null = null;
  private lastStableStatus: DriveSyncStableStatus = 'disconnected';
  private knownManifest: RemoteSyncManifest | SyncManifest | null = null;
  private passwordlessManifest: SyncManifest | null = null;
  private pendingManifest: RemoteSyncManifest | null = null;

  constructor(private readonly dependencies: DriveSyncServiceDependencies) {}

  async initialize(): Promise<DriveSyncViewState> {
    if (!this.dependencies.configured) return this.state('unconfigured');
    const [secret, stored] = await Promise.all([
      this.dependencies.secrets.get(),
      this.dependencies.runtimeStorage.get(DEVICE_ID_KEY),
    ]);
    if (!secret && typeof stored[DEVICE_ID_KEY] !== 'string') return this.state('disconnected');
    try {
      await this.dependencies.auth.getAccessToken();
      return this.state('ready');
    } catch {
      return this.state('disconnected');
    }
  }

  async connect(): Promise<DriveSyncViewState> {
    if (!this.dependencies.configured) return this.state('unconfigured');
    await this.dependencies.auth.connect();
    const manifest = await this.downloadManifest();
    if (manifest && isLegacyManifest(manifest)) {
      const secret = await this.dependencies.secrets.get();
      if (secret) {
        await this.sync();
        return this.state('ready');
      }
      this.pendingManifest = manifest;
      return this.state('remote-missing', 'Vault cũ đang mã hóa và cần migration trên thiết bị đã mở khóa. Dữ liệu local vẫn an toàn.');
    }
    if (manifest && isSyncManifest(manifest)) {
      this.passwordlessManifest = manifest;
      await this.storeDeviceId(manifest.deviceId);
      return this.state('ready');
    }
    this.passwordlessManifest = createSyncManifest(this.uuid(), this.now());
    await this.writePasswordlessManifest(this.passwordlessManifest);
    await this.storeDeviceId(this.passwordlessManifest.deviceId);
    await this.sync();
    return this.state('ready');
  }

  async submitPassphrase(passphrase: string): Promise<DriveSyncViewState> {
    let masterKey: CryptoKey;
    let manifest: RemoteSyncManifest;
    if (this.pendingManifest) {
      masterKey = await unlockSyncVault(this.pendingManifest, passphrase);
      manifest = migrateSyncManifest(this.pendingManifest);
    } else {
      const created = await createSyncVault(passphrase, crypto, this.now());
      masterKey = created.masterKey;
      manifest = created.manifest;
    }

    const storedDeviceId = (await this.dependencies.runtimeStorage.get(DEVICE_ID_KEY))[DEVICE_ID_KEY];
    const deviceId = typeof storedDeviceId === 'string' && storedDeviceId
      ? storedDeviceId
      : this.uuid();
    const registeredManifest = registerManifestDevice(manifest, deviceId);
    await this.dependencies.drive.upsertFile(
      MANIFEST_FILE_NAME,
      new TextEncoder().encode(JSON.stringify(registeredManifest)),
      'application/json',
    );
    await this.dependencies.stateStore.clear();
    await Promise.all([
      this.dependencies.secrets.put({
        createdAt: this.now(),
        deviceId,
        id: 'google-drive',
        masterKey,
      }),
      this.dependencies.runtimeStorage.set({ [DEVICE_ID_KEY]: deviceId }),
    ]);
    this.pendingManifest = null;
    await this.sync();
    return this.state('ready');
  }
  async sync(): Promise<SyncRunResult> {
    await this.dependencies.auth.getAccessToken();
    const secret = await this.dependencies.secrets.get();
    const deviceId = await this.getOrCreateDeviceId();
    await this.ensureActiveManifest(deviceId);
    const engine = new GoogleDriveSyncEngine(
      this.dependencies.drive,
      this.dependencies.dataSource,
      this.dependencies.stateStore,
      secret?.masterKey ?? null,
      deviceId,
      this.dependencies.now,
      null,
    );
    const result = await engine.sync();
    this.lastResult = result;
    const mergedSnapshot = await this.dependencies.stateStore.get();
    if (mergedSnapshot) {
      const currentManifest = this.passwordlessManifest ?? createSyncManifest(deviceId, this.now());
      this.passwordlessManifest = manifestFromSnapshot(currentManifest, mergedSnapshot, deviceId, this.now());
      await this.writePasswordlessManifest(this.passwordlessManifest);
    }
    await this.dependencies.runtimeStorage.set({ [LAST_SYNCED_AT_KEY]: this.now() });
    return result;
  }
  async restoreRevision(revisionId: string) {
    const [secret, snapshot] = await Promise.all([
      this.dependencies.secrets.get(),
      this.dependencies.stateStore.get(),
    ]);
    if (!snapshot) throw new Error('Chưa có lịch sử đồng bộ để khôi phục.');
    const deviceId = secret?.deviceId ?? await this.getOrCreateDeviceId();
    await this.ensureActiveManifest(deviceId);
    const revision = snapshot.revisions.find((candidate) => revisionKey(candidate) === revisionId);
    if (!revision) throw new Error('Sync revision is no longer available.');
    const now = this.now();
    const wallTimeMs = Math.max(Date.parse(now), snapshot.clock.wallTimeMs);
    const clock = {
      counter: wallTimeMs === snapshot.clock.wallTimeMs ? snapshot.clock.counter + 1 : 0,
      deviceId,
      wallTimeMs,
    };
    const records = snapshot.records.filter((record) => `${record.entityType}:${record.id}` !== `${revision.entityType}:${revision.id}`);
    records.push({
      clock,
      contentHash: revision.contentHash,
      deleted: revision.deleted,
      entityType: revision.entityType,
      id: revision.id,
      modifiedAt: now,
      originDeviceId: deviceId,
      value: revision.value,
      version: { ...snapshot.records.find((record) => record.entityType === revision.entityType && record.id === revision.id)?.version, [deviceId]: (snapshot.records.find((record) => record.entityType === revision.entityType && record.id === revision.id)?.version[deviceId] ?? 0) + 1 },
    });
    const restored = { ...snapshot, clock, generatedAt: now, records };
    await this.replaceLocalRecords(restored.records, secret?.masterKey ?? null);
    await this.dependencies.stateStore.put(restored);
    await this.sync();
    return this.state('ready');
  }
  async disconnect() {
    await Promise.all([
      this.dependencies.auth.disconnect(),
      this.dependencies.secrets.clear(),
      this.dependencies.stateStore.clear(),
      this.dependencies.runtimeStorage.remove(LAST_SYNCED_AT_KEY),
    ]);
    this.pendingManifest = null;
    return this.state('disconnected');
  }

  async deleteLocalData() {
    const lastSyncedAt = (await this.dependencies.runtimeStorage.get(LAST_SYNCED_AT_KEY))[LAST_SYNCED_AT_KEY];
    if (typeof lastSyncedAt !== 'string') throw new Error('Sync successfully before refreshing local data.');
    await this.sync();
    const [secret, snapshot] = await Promise.all([
      this.dependencies.secrets.get(),
      this.dependencies.stateStore.get(),
    ]);
    if (!snapshot) throw new Error('Sync Google Drive before refreshing local data.');
    await this.replaceLocalRecords(snapshot.records, secret?.masterKey ?? null);
    return this.state('ready');
  }
  async deleteRemoteVault() {
    await this.revokeRemoteVault(false);
    await this.disconnect();
    return this.state('disconnected');
  }

  async deleteAllData() {
    await this.revokeRemoteVault(true);
    await this.disconnect();
    await this.dependencies.runtimeStorage.remove(DEVICE_ID_KEY);
    await this.dependencies.dataSource.clear?.();
    return this.state('disconnected');
  }

  async resetRemoteVault() {
    return this.rebuildRemoteFromLocal();
  }

  async rebuildRemoteFromLocal() {
    await this.dependencies.auth.getAccessToken();
    const manifest = createSyncManifest(
      this.uuid(),
      this.now(),
      (this.passwordlessManifest?.generation ?? 0) + 1,
    );
    this.passwordlessManifest = manifest;
    await this.writePasswordlessManifest(manifest);
    await this.dependencies.stateStore.clear();
    await this.sync();
    return this.state('ready');
  }
  async viewState(status: DriveSyncStatus, error: string | null = null) {
    return this.state(status, error);
  }

  private async replaceLocalRecords(
    records: Parameters<SyncDataSource['replace']>[0],
    masterKey: CryptoKey | null,
  ) {
    const dataset = await this.dependencies.dataSource.read();
    let driveFiles: Awaited<ReturnType<DriveAppDataClient['listFiles']>> | undefined;
    await this.dependencies.dataSource.replace(records, async (hash) => {
      const local = dataset.blobs.get(hash);
      if (local) return local;
      driveFiles ??= await this.dependencies.drive.listFiles();
      const file = driveFiles.find(({ name }) => name === `blob-${hash}.bin`);
      if (!file) throw new Error(`Synced attachment blob is missing: ${hash}.`);
      const bytes = await this.dependencies.drive.downloadFile(file.id);
      if (!masterKey) return bytes;
      const encrypted = JSON.parse(new TextDecoder().decode(bytes)) as EncryptedSyncPayload;
      if (encrypted.context !== `blob:${hash}`) throw new Error('Encrypted Drive blob context mismatch.');
      return decryptSyncPayload(masterKey, encrypted);
    });
  }
  private async ensureActiveManifest(deviceId: string) {
    const manifest = await this.downloadManifest();
    if (!manifest) throw new RemoteSyncMissingError();
    if (isSyncManifest(manifest)) {
      this.passwordlessManifest = { ...manifest, deviceId, updatedAt: this.now() };
      await this.writePasswordlessManifest(this.passwordlessManifest);
      return;
    }
    if (manifest.status === 'revoked') throw new RemoteSyncMissingError();
    const registered = registerManifestDevice(migrateSyncManifest(manifest), deviceId);
    if (JSON.stringify(registered) !== JSON.stringify(manifest)) {
      await this.dependencies.drive.upsertFile(
        MANIFEST_FILE_NAME,
        new TextEncoder().encode(JSON.stringify(registered)),
        'application/json',
      );
    }
  }

  private async revokeRemoteVault(requireAllDevicesV2: boolean) {
    const manifest = await this.downloadManifest();
    if (!manifest) throw new Error('Google Drive sync vault manifest is missing.');
    if (isSyncManifest(manifest)) {
      const files = await this.dependencies.drive.listFiles();
      await Promise.all(files
        .filter(({ name }) => name === MANIFEST_FILE_NAME || name.startsWith('device-') || name.startsWith('blob-'))
        .map(({ id }) => this.dependencies.drive.deleteFile(id)));
      this.passwordlessManifest = null;
      return;
    }
    const current = migrateSyncManifest(manifest);
    if (requireAllDevicesV2 && current.devices.some(({ snapshotFormatVersion }) => snapshotFormatVersion < 2)) {
      throw new Error('Update or remove legacy devices before deleting all data.');
    }
    const revoked = createRevokedSyncManifest(current, this.now());
    await this.dependencies.drive.upsertFile(
      MANIFEST_FILE_NAME,
      new TextEncoder().encode(JSON.stringify(revoked)),
      'application/json',
    );
    const files = await this.dependencies.drive.listFiles();
    const encryptedFiles = files.filter(({ name }) => name.startsWith('device-') || name.startsWith('blob-'));
    await Promise.all(encryptedFiles.map(({ id }) => this.dependencies.drive.deleteFile(id)));
  }
  private async downloadManifest() {
    const manifestFile = (await this.dependencies.drive.listFiles()).find(({ name }) => name === MANIFEST_FILE_NAME);
    if (!manifestFile) {
      this.knownManifest = null;
      return null;
    }
    const value = JSON.parse(new TextDecoder().decode(await this.dependencies.drive.downloadFile(manifestFile.id))) as RemoteSyncManifest | SyncManifest;
    this.knownManifest = value;
    return value;
  }

  private async writePasswordlessManifest(manifest: SyncManifest) {
    await this.dependencies.drive.upsertFile(
      MANIFEST_FILE_NAME,
      new TextEncoder().encode(JSON.stringify(manifest)),
      'application/json',
    );
  }

  private async getOrCreateDeviceId() {
    const stored = (await this.dependencies.runtimeStorage.get(DEVICE_ID_KEY))[DEVICE_ID_KEY];
    if (typeof stored === 'string' && stored) return stored;
    const deviceId = this.uuid();
    await this.storeDeviceId(deviceId);
    return deviceId;
  }

  private async storeDeviceId(deviceId: string) {
    await this.dependencies.runtimeStorage.set({ [DEVICE_ID_KEY]: deviceId });
  }

  private async state(status: DriveSyncStatus, error: string | null = null): Promise<DriveSyncViewState> {
    if (status !== 'authorizing' && status !== 'syncing') this.lastStableStatus = status;
    const stored = (await this.dependencies.runtimeStorage.get(LAST_SYNCED_AT_KEY))[LAST_SYNCED_AT_KEY];
    const lastSyncedAt = typeof stored === 'string' ? stored : null;
    const revisions = (await this.dependencies.stateStore.get())?.revisions ?? [];
    const legacyDevices = (!this.knownManifest || isSyncManifest(this.knownManifest) ? [] : this.knownManifest.devices)
      ?.filter(({ snapshotFormatVersion }) => snapshotFormatVersion < 2)
      .map(({ deviceId }) => deviceId) ?? [];
    return {
      canDeleteAll: Boolean(this.knownManifest && (isSyncManifest(this.knownManifest) || this.knownManifest.status !== 'revoked') && legacyDevices.length === 0),
      canDeleteLocal: Boolean(lastSyncedAt),
      error,
      lastResult: this.lastResult,
      lastStableStatus: this.lastStableStatus,
      lastSyncedAt,
      legacyDevices,
      revisions: [...revisions].sort((first, second) => second.replacedAt.localeCompare(first.replacedAt)),
      status,
      supportsBackgroundRefresh: this.dependencies.auth.supportsBackgroundRefresh,
    };
  }
  private now() {
    return (this.dependencies.now ?? (() => new Date().toISOString()))();
  }

  private uuid() {
    return (this.dependencies.uuid ?? (() => crypto.randomUUID()))();
  }
}

function revisionKey(revision: SyncRevision) {
  return `${revision.entityType}:${revision.id}:${revision.clock.wallTimeMs}:${revision.clock.counter}:${revision.clock.deviceId}`;
}

export class RemoteSyncMissingError extends Error {
  readonly kind = 'remoteMissing' as const;

  constructor() {
    super('Bản đồng bộ trên Google Drive không còn tồn tại. Dữ liệu trên thiết bị này vẫn an toàn.');
    this.name = 'RemoteSyncMissingError';
  }
}

function createSyncManifest(syncSpaceId: string, now: string, generation = 1): SyncManifest {
  return {
    schemaVersion: 3,
    syncSpaceId,
    generation,
    deviceId: syncSpaceId,
    updatedAt: now,
    entities: { notes: {}, tasks: {}, folders: {}, reminders: {}, attachments: {} },
    tombstones: {},
  };
}

function isSyncManifest(value: unknown): value is SyncManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<SyncManifest>;
  return manifest.schemaVersion === 3
    && typeof manifest.syncSpaceId === 'string'
    && typeof manifest.generation === 'number'
    && typeof manifest.deviceId === 'string';
}

function isLegacyManifest(value: RemoteSyncManifest | SyncManifest): value is RemoteSyncManifest {
  return !isSyncManifest(value);
}

function manifestFromSnapshot(
  manifest: SyncManifest,
  snapshot: Awaited<ReturnType<SyncStateStore['get']>>,
  deviceId: string,
  updatedAt: string,
): SyncManifest {
  const entities = {
    notes: {} as Record<string, Record<string, unknown>>,
    tasks: {} as Record<string, Record<string, unknown>>,
    folders: {} as Record<string, Record<string, unknown>>,
    reminders: {} as Record<string, Record<string, unknown>>,
    attachments: {} as Record<string, Record<string, unknown>>,
  };
  const tombstones: SyncManifest['tombstones'] = {};
  for (const record of snapshot?.records ?? []) {
    if (record.entityType === 'settings') continue;
    const key = record.id;
    if (record.deleted) {
      tombstones[`${record.entityType}:${key}`] = { deletedAt: record.modifiedAt, updatedAt: record.modifiedAt };
      continue;
    }
    const bucket = entities[`${record.entityType}s` as keyof typeof entities];
    if (bucket) bucket[key] = record.value ?? {};
  }
  return { ...manifest, schemaVersion: 3, deviceId, updatedAt, entities, tombstones };
}
function registerManifestDevice(manifest: RemoteSyncManifest, deviceId: string) {
  const current = migrateSyncManifest(manifest);
  const devices = current.devices.filter((device) => device.deviceId !== deviceId);
  devices.push({ deviceId, snapshotFormatVersion: 2 });
  devices.sort((first, second) => first.deviceId.localeCompare(second.deviceId));
  return { ...current, devices };
}
const e2eDriveFiles = new Map<string, { bytes: Uint8Array; id: string }>();

function createE2EDriveClient(): DriveAppDataClient {
  return {
    deleteFile(fileId) {
      const entry = Array.from(e2eDriveFiles.entries()).find(([, file]) => file.id === fileId);
      if (entry) e2eDriveFiles.delete(entry[0]);
      return Promise.resolve();
    },
    downloadFile(fileId) {
      const file = Array.from(e2eDriveFiles.values()).find((candidate) => candidate.id === fileId);
      return file
        ? Promise.resolve(file.bytes.slice())
        : Promise.reject(new Error('E2E Drive file not found.'));
    },
    listFiles() {
      return Promise.resolve(Array.from(e2eDriveFiles, ([name, file]) => ({ id: file.id, name })));
    },
    upsertFile(name, bytes) {
      const file = { bytes: bytes.slice(), id: e2eDriveFiles.get(name)?.id ?? 'e2e-' + name };
      e2eDriveFiles.set(name, file);
      return Promise.resolve({ id: file.id, name });
    },
  };
}

export function createDefaultDriveSyncService(database: MochiDatabase) {
  const configuredClientId: unknown = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;
  const configuredEdgeClientId: unknown = import.meta.env.WXT_GOOGLE_EDGE_OAUTH_CLIENT_ID;
  const configuredEdgeClientSecret: unknown = import.meta.env.WXT_GOOGLE_EDGE_OAUTH_CLIENT_SECRET;
  const configuredTestMode: unknown = import.meta.env.WXT_GOOGLE_DRIVE_SYNC_TEST_MODE;
  const clientId = typeof configuredClientId === 'string' ? configuredClientId.trim() : '';
  const edgeClientId = typeof configuredEdgeClientId === 'string' ? configuredEdgeClientId.trim() : '';
  const edgeClientSecret = typeof configuredEdgeClientSecret === 'string' ? configuredEdgeClientSecret.trim() : '';
  const isEdge = /Edg\//.test(navigator.userAgent);
  const activeClientId = isEdge ? edgeClientId : clientId;
  const dataSource = new MochiDatabaseSyncDataSource(database);
  const secrets = createMochiRepositories(database).syncSecrets;

  // The compile-time E2E mode exercises the complete vault lifecycle without external OAuth or network access.
  if (configuredTestMode === 'true') {
    const auth: DriveAuthClient = {
      connect: () => Promise.resolve('e2e-token'),
      disconnect: () => Promise.resolve(),
      getAccessToken: () => Promise.resolve('e2e-token'),
      invalidateAccessToken: () => Promise.resolve(),
      supportsBackgroundRefresh: true,
    };
    return new DriveSyncService({
      auth,
      configured: true,
      dataSource,
      drive: createE2EDriveClient(),
      runtimeStorage: browser.storage.local,
      secrets,
      stateStore: new IndexedDbSyncStateStore(),
    });
  }

  if (!activeClientId) {
    const unavailable = () => Promise.reject(new DriveAuthRequiredError('Google OAuth client ID is not configured.'));
    return new DriveSyncService({
      auth: {
        connect: unavailable,
        disconnect: () => Promise.resolve(),
        getAccessToken: unavailable,
        invalidateAccessToken: () => Promise.resolve(),
        supportsBackgroundRefresh: false,
      },
      configured: false,
      dataSource,
      drive: {
        deleteFile: unavailable,
        downloadFile: unavailable,
        listFiles: unavailable,
        upsertFile: unavailable,
      },
      runtimeStorage: {
        get: () => Promise.resolve({}),
        remove: () => Promise.resolve(),
        set: () => Promise.resolve(),
      },
      secrets,
      stateStore: {
        clear: () => Promise.resolve(),
        get: () => Promise.resolve(undefined),
        put: () => Promise.resolve(),
      },
    });
  }

  const auth = createDriveAuthClient(clientId, navigator.userAgent, edgeClientId, edgeClientSecret);
  const drive = new GoogleDriveAppDataClient(auth);
  return new DriveSyncService({
    auth,
    configured: true,
    dataSource,
    drive,
    runtimeStorage: browser.storage.local,
    secrets,
    stateStore: new IndexedDbSyncStateStore(),
  });
}
