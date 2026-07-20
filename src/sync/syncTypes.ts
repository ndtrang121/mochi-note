export type SyncEntityType =
  | 'attachment'
  | 'folder'
  | 'note'
  | 'reminder'
  | 'settings'
  | 'task';

export type VersionVector = Record<string, number>;

export interface SyncEntityRecord {
  deleted: boolean;
  entityType: SyncEntityType;
  id: string;
  modifiedAt: string;
  originDeviceId: string;
  value: Record<string, unknown> | null;
  version: VersionVector;
}

export interface DeviceSyncSnapshot {
  deviceId: string;
  formatVersion: 1;
  generatedAt: string;
  records: SyncEntityRecord[];
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
}
