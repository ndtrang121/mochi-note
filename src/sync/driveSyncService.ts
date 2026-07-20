import type { MochiDatabase } from '../db/database';
import { createMochiRepositories, type SyncSecretRepository } from '../db/repositories';
import { MochiDatabaseSyncDataSource } from './databaseSyncSource';
import { GoogleDriveAppDataClient, type DriveAppDataClient } from './driveAppData';
import { createDriveAuthClient, DriveAuthRequiredError, type DriveAuthClient } from './driveAuth';
import {
  createSyncVault,
  unlockSyncVault,
  type RemoteSyncManifest,
} from './syncCrypto';
import { GoogleDriveSyncEngine, type SyncRunResult } from './syncEngine';
import { BrowserSyncStateStore } from './syncStateStore';
import type { SyncDataSource, SyncStateStore } from './syncTypes';

const MANIFEST_FILE_NAME = 'mochinote-manifest.json';
const LAST_SYNCED_AT_KEY = 'google-drive-last-synced-at';

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
    if (this.pendingManifest) {
      masterKey = await unlockSyncVault(this.pendingManifest, passphrase);
    } else {
      const created = await createSyncVault(passphrase, crypto, this.now());
      masterKey = created.masterKey;
      await this.dependencies.drive.upsertFile(
        MANIFEST_FILE_NAME,
        new TextEncoder().encode(JSON.stringify(created.manifest)),
        'application/json',
      );
    }

    await this.dependencies.stateStore.clear();
    await this.dependencies.secrets.put({
      createdAt: this.now(),
      deviceId: this.uuid(),
      id: 'google-drive',
      masterKey,
    });
    this.pendingManifest = null;
    await this.sync();
    return this.state('ready');
  }

  async sync(): Promise<SyncRunResult> {
    const secret = await this.dependencies.secrets.get();
    if (!secret) throw new DriveAuthRequiredError('Unlock Google Drive sync first.');
    await this.dependencies.auth.getAccessToken();
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

  async resetRemoteVault() {
    const files = await this.dependencies.drive.listFiles();
    const ownedFiles = files.filter(({ name }) =>
      name === MANIFEST_FILE_NAME || name.startsWith('device-') || name.startsWith('blob-'),
    );
    await Promise.all(ownedFiles.map(({ id }) => this.dependencies.drive.deleteFile(id)));
    return this.disconnect();
  }

  async viewState(status: DriveSyncStatus, error: string | null = null) {
    return this.state(status, error);
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

export function createDefaultDriveSyncService(database: MochiDatabase) {
  const configuredClientId: unknown = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;
  const clientId = typeof configuredClientId === 'string' ? configuredClientId.trim() : '';
  const dataSource = new MochiDatabaseSyncDataSource(database);
  const secrets = createMochiRepositories(database).syncSecrets;
  if (!clientId) {
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

  const auth = createDriveAuthClient(clientId);
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
