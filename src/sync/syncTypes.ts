export type SyncEntityType =
  | 'attachment'
  | 'folder'
  | 'note'
  | 'reminder'
  | 'settings'
  | 'task';

export const SYNC_SCHEMA_VERSION = 3;

/** Passwordless appDataFolder contract. Entity identity is always type + id. */
export interface SyncManifest {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  syncSpaceId: string;
  generation: number;
  deviceId: string;
  updatedAt: string;
  entities: {
    notes: Record<string, Record<string, unknown>>;
    tasks: Record<string, Record<string, unknown>>;
    folders: Record<string, Record<string, unknown>>;
    reminders: Record<string, Record<string, unknown>>;
    attachments: Record<string, Record<string, unknown>>;
  };
  tombstones: Record<string, { deletedAt: string; updatedAt: string }>;
}

export type SyncFailureKind =
  | 'oauthExpired'
  | 'remoteMissing'
  | 'network'
  | 'schemaIncompatible'
  | 'mergeFailure'
  | 'permission';

export type VersionVector = Record<string, number>;

export interface HybridTimestamp {
  wallTimeMs: number;
  counter: number;
  deviceId: string;
}

export interface SyncEntityRecord {
  clock: HybridTimestamp;
  contentHash: string;
  deleted: boolean;
  entityType: SyncEntityType;
  fieldClocks?: Record<string, HybridTimestamp>;
  id: string;
  modifiedAt: string;
  originDeviceId: string;
  value: Record<string, unknown> | null;
  version: VersionVector;
}

export interface SyncRevision {
  clock: HybridTimestamp;
  contentHash: string;
  deleted: boolean;
  entityType: SyncEntityType;
  expiresAt: string;
  id: string;
  modifiedAt: string;
  originDeviceId: string;
  reason: 'lww-replaced';
  replacedAt: string;
  value: Record<string, unknown> | null;
}

export interface DeviceSyncSnapshot {
  clock: HybridTimestamp;
  deviceId: string;
  formatVersion: 2;
  generatedAt: string;
  records: SyncEntityRecord[];
  revisions: SyncRevision[];
}


export interface RemoteSnapshotCacheEntry {
  fileId: string;
  fingerprint: string;
  snapshot: DeviceSyncSnapshot;
}

export interface SyncLocalState {
  formatVersion: 1;
  hlc?: HybridTimestamp;
  lastDatasetHash?: string;
  lastSnapshotHash?: string;
  remoteFileIndex?: Record<string, { fileId: string; fingerprint: string }>;
  remoteSnapshots: Record<string, RemoteSnapshotCacheEntry>;
}
export interface LocalSyncEntity {
  entityType: SyncEntityType;
  id: string;
  value: Record<string, unknown>;
}

export interface SyncDataset {
  blobs: Map<string, Uint8Array>;
  entities: LocalSyncEntity[];
}

export interface SyncDataSource {
  clear?(): Promise<void>;
  read(): Promise<SyncDataset>;
  replace(
    records: SyncEntityRecord[],
    readBlob: (hash: string) => Promise<Uint8Array>,
  ): Promise<void>;
}

export interface SyncStateStore {
  clear(): Promise<void>;
  get(): Promise<DeviceSyncSnapshot | undefined>;
  put(snapshot: DeviceSyncSnapshot): Promise<void>;
  getLocalState?(): Promise<SyncLocalState | undefined>;
  putLocalState?(state: SyncLocalState): Promise<void>;
}
