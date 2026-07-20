import type { MochiDatabase } from '../db/database';
import { createMochiRepositories, type SyncSecretRepository } from '../db/repositories';
import { MochiDatabaseSyncDataSource } from './databaseSyncSource';
import { GoogleDriveAppDataClient, type DriveAppDataClient } from './driveAppData';
import { createDriveAuthClient, DriveAuthRequiredError, type DriveAuthClient } from './driveAuth';
import {
  createRevokedSyncManifest,
  createSyncVault,
  migrateSyncManifest,
  unlockSyncVault,
  type RemoteSyncManifest,
} from './syncCrypto';
import { GoogleDriveSyncEngine, type SyncRunResult } from './syncEngine';
import { BrowserSyncStateStore } from './syncStateStore';
import type { SyncDataSource, SyncStateStore } from './syncTypes';

const MANIFEST_FILE_NAME = 'mochinote-manifest.json';
const LAST_SYNCED_AT_KEY = 'google-drive-last-synced-at';
const DEVICE_ID_KEY = 'google-drive-device-id';

export type DriveSyncStatus =
  | 'authorizing'
  | 'disconnected'
  | 'error'
  | 'locked'
  | 'needs-new-passphrase'
  | 'ready'
  | 'syncing'
  | 'unconfigured';

export interface DriveSyncViewState {
  error: string | null;
  lastSyncedAt: string | null;
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
  private pendingManifest: RemoteSyncManifest | null = null;

  constructor(private readonly dependencies: DriveSyncServiceDependencies) {}

  async initialize(): Promise<DriveSyncViewState> {
    if (!this.dependencies.configured) return this.state('unconfigured');
    const secret = await this.dependencies.secrets.get();
    if (!secret) return this.state('disconnected');
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
    const secret = await this.dependencies.secrets.get();
    if (secret) return this.state('ready');

    const manifest = await this.downloadManifest();
    this.pendingManifest = manifest;
    return this.state(manifest ? 'locked' : 'needs-new-passphrase');
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
    const secret = await this.dependencies.secrets.get();
    if (!secret) throw new DriveAuthRequiredError('Unlock Google Drive sync first.');
    await this.dependencies.auth.getAccessToken();
    await this.ensureActiveManifest(secret.deviceId);
    const engine = new GoogleDriveSyncEngine(
      this.dependencies.drive,
      this.dependencies.dataSource,
      this.dependencies.stateStore,
      secret.masterKey,
      secret.deviceId,
      this.dependencies.now,
    );
    const result = await engine.sync();
    await this.dependencies.runtimeStorage.set({ [LAST_SYNCED_AT_KEY]: this.now() });
    return result;
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
    if (typeof lastSyncedAt !== 'string') throw new Error('Sync successfully before deleting local data.');
    await this.disconnect();
    await this.dependencies.runtimeStorage.remove(DEVICE_ID_KEY);
    await this.dependencies.dataSource.clear?.();
    return this.state('disconnected');
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
    return this.deleteRemoteVault();
  }
  async viewState(status: DriveSyncStatus, error: string | null = null) {
    return this.state(status, error);
  }

  private async ensureActiveManifest(deviceId: string) {
    const manifest = await this.downloadManifest();
    if (!manifest) throw new Error('Google Drive sync vault manifest is missing.');
    if (manifest.status === 'revoked') throw new Error('Google Drive sync vault has been revoked.');
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
    if (!manifestFile) return null;
    const value = JSON.parse(new TextDecoder().decode(await this.dependencies.drive.downloadFile(manifestFile.id))) as RemoteSyncManifest;
    return value;
  }

  private async state(status: DriveSyncStatus, error: string | null = null): Promise<DriveSyncViewState> {
    const stored = (await this.dependencies.runtimeStorage.get(LAST_SYNCED_AT_KEY))[LAST_SYNCED_AT_KEY];
    return {
      error,
      lastSyncedAt: typeof stored === 'string' ? stored : null,
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
      stateStore: new BrowserSyncStateStore(),
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
    stateStore: new BrowserSyncStateStore(),
  });
}
