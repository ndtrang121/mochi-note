export type SyncEntityType =
  | 'attachment'
  | 'folder'
  | 'note'
  | 'reminder'
  | 'settings'
  | 'task';

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
  lastDatasetHash?: string;
  lastSnapshotHash?: string;
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
