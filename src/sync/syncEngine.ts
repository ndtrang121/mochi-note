import type { DriveAppDataClient, DriveAppDataFile } from './driveAppData';
import {
  decryptSyncPayload,
  encryptSyncPayload,
  type EncryptedSyncPayload,
} from './syncCrypto';
import { buildLocalSnapshot, mergeSnapshots, migrateSnapshot } from './snapshotMerge';
import type {
  DeviceSyncSnapshot,
  SyncDataSource,
  SyncEntityRecord,
  SyncStateStore,
} from './syncTypes';

const SNAPSHOT_PREFIX = 'device-';
const BLOB_PREFIX = 'blob-';

export interface SyncRunResult {
  downloadedSnapshots: number;
  mergedRecords: number;
  transferredBlobs: number;
  uploadedSnapshot: string;
}

export class GoogleDriveSyncEngine {
  private running: Promise<SyncRunResult> | null = null;

  constructor(
    private readonly drive: DriveAppDataClient,
    private readonly dataSource: SyncDataSource,
    private readonly stateStore: SyncStateStore,
    private readonly masterKey: CryptoKey,
    private readonly deviceId: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    if (!/^[a-zA-Z0-9-]+$/.test(deviceId)) throw new Error('Sync device ID contains unsupported characters.');
  }

  sync() {
    if (!this.running) {
      this.running = this.run().finally(() => { this.running = null; });
    }
    return this.running;
  }

  private async run(): Promise<SyncRunResult> {
    const generatedAt = this.now();
    const [files, dataset, previous] = await Promise.all([
      this.drive.listFiles(),
      this.dataSource.read(),
      this.stateStore.get(),
    ]);
    const filesByName = new Map(files.map((file) => [file.name, file]));
    const localSnapshot = await buildLocalSnapshot(dataset.entities, previous, this.deviceId, generatedAt);
    const remoteSnapshots = await this.downloadSnapshots(files);
    const merged = mergeSnapshots([...remoteSnapshots, localSnapshot], this.deviceId, generatedAt);

    let transferredBlobs = 0;
    for (const [hash, bytes] of dataset.blobs) {
      const fileName = blobFileName(hash);
      if (filesByName.has(fileName)) continue;
      await this.uploadEncrypted(fileName, bytes, `blob:${hash}`);
      filesByName.set(fileName, { id: fileName, name: fileName });
      transferredBlobs += 1;
    }

    const blobCache = new Map(dataset.blobs);
    await this.dataSource.replace(merged.records, async (hash) => {
      const cached = blobCache.get(hash);
      if (cached) return cached;
      const file = filesByName.get(blobFileName(hash));
      if (!file) throw new Error(`Synced attachment blob is missing: ${hash}.`);
      const bytes = await this.downloadEncrypted(file, `blob:${hash}`);
      blobCache.set(hash, bytes);
      transferredBlobs += 1;
      return bytes;
    });
    await this.stateStore.put(merged);

    const snapshotName = snapshotFileName(this.deviceId);
    await this.uploadEncrypted(
      snapshotName,
      new TextEncoder().encode(JSON.stringify(merged)),
      `snapshot:${this.deviceId}`,
    );
    return {
      downloadedSnapshots: remoteSnapshots.length,
      mergedRecords: merged.records.length,
      transferredBlobs,
      uploadedSnapshot: snapshotName,
    };
  }

  private async downloadSnapshots(files: DriveAppDataFile[]) {
    const snapshotFiles = files.filter((file) => file.name.startsWith(SNAPSHOT_PREFIX) && file.name.endsWith('.bin'));
    return Promise.all(snapshotFiles.map(async (file) => {
      const remoteDeviceId = file.name.slice(SNAPSHOT_PREFIX.length, -'.bin'.length);
      const plaintext = await this.downloadEncrypted(file, `snapshot:${remoteDeviceId}`);
      return parseSnapshot(new TextDecoder().decode(plaintext));
    }));
  }

  private async downloadEncrypted(file: DriveAppDataFile, context: string) {
    const payload = parseEncryptedPayload(new TextDecoder().decode(await this.drive.downloadFile(file.id)));
    if (payload.context !== context) throw new Error(`Encrypted Drive file context mismatch: ${file.name}.`);
    return decryptSyncPayload(this.masterKey, payload);
  }

  private async uploadEncrypted(fileName: string, content: Uint8Array, context: string) {
    const payload = await encryptSyncPayload(this.masterKey, content, context);
    await this.drive.upsertFile(
      fileName,
      new TextEncoder().encode(JSON.stringify(payload)),
      'application/octet-stream',
    );
  }
}

function parseEncryptedPayload(value: string): EncryptedSyncPayload {
  const payload = JSON.parse(value) as Partial<EncryptedSyncPayload>;
  if (
    payload.formatVersion !== 1 ||
    payload.algorithm !== 'AES-GCM-256' ||
    typeof payload.ciphertext !== 'string' ||
    typeof payload.context !== 'string' ||
    typeof payload.iv !== 'string'
  ) {
    throw new Error('Encrypted Google Drive payload is invalid.');
  }
  return payload as EncryptedSyncPayload;
}

function parseSnapshot(value: string): DeviceSyncSnapshot {
  const snapshot = JSON.parse(value) as Partial<DeviceSyncSnapshot> & { formatVersion?: number };
  if (typeof snapshot.deviceId !== 'string' || typeof snapshot.generatedAt !== 'string' || !Array.isArray(snapshot.records)) {
    throw new Error('Google Drive device snapshot is invalid.');
  }
  if (!snapshot.records.every(isSyncRecord)) throw new Error('Google Drive device snapshot contains an invalid record.');
  return migrateSnapshot(snapshot as DeviceSyncSnapshot, snapshot.deviceId, snapshot.generatedAt);
}
function isSyncRecord(value: unknown): value is SyncEntityRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SyncEntityRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.entityType === 'string' &&
    typeof record.deleted === 'boolean' &&
    typeof record.modifiedAt === 'string' &&
    typeof record.originDeviceId === 'string' &&
    Boolean(record.version) &&
    typeof record.version === 'object'
  );
}

function snapshotFileName(deviceId: string) {
  return `${SNAPSHOT_PREFIX}${deviceId}.bin`;
}

function blobFileName(hash: string) {
  return `${BLOB_PREFIX}${hash}.bin`;
}
