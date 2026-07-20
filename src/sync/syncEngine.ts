import type { DriveAppDataClient, DriveAppDataFile } from './driveAppData';
import {
  decryptSyncPayload,
  encryptSyncPayload,
  sha256Hex,
  type EncryptedSyncPayload,
} from './syncCrypto';
import { buildLocalSnapshot, clampSnapshotClock, mergeSnapshots, migrateSnapshot } from './snapshotMerge';
import type {
  DeviceSyncSnapshot,
  RemoteSnapshotCacheEntry,
  SyncDataSource,
  SyncEntityRecord,
  SyncLocalState,
  SyncStateStore,
} from './syncTypes';

const SNAPSHOT_PREFIX = 'device-';
const BLOB_PREFIX = 'blob-';

export interface SyncRunResult {
  downloadedSnapshots: number;
  mergedRecords: number;
  recordWinners: number;
  skippedRecords: number;
  revisionsCreated: number;
  transferredBlobs: number;
  transferredBytes: number;
  uploadedSnapshot: string | null;
  replacedLocal: boolean;
}

interface DownloadSnapshotResult {
  bytes: number;
  cache: Record<string, RemoteSnapshotCacheEntry>;
  downloaded: number;
  snapshots: DeviceSyncSnapshot[];
}

export class GoogleDriveSyncEngine {
  private running: Promise<SyncRunResult> | null = null;

  constructor(
    private readonly drive: DriveAppDataClient,
    private readonly dataSource: SyncDataSource,
    private readonly stateStore: SyncStateStore,
    private readonly masterKey: CryptoKey | null,
    private readonly deviceId: string,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly writeKey: CryptoKey | null = masterKey,
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
    const [files, dataset, previous, cachedState] = await Promise.all([
      this.drive.listFiles(),
      this.dataSource.read(),
      this.stateStore.get(),
      this.stateStore.getLocalState?.(),
    ]);
    const localState = cachedState ?? createEmptyLocalState();
    const filesByName = new Map(files.map((file) => [file.name, file]));
    const localSnapshot = await buildLocalSnapshot(dataset.entities, previous, this.deviceId, generatedAt);
    const remote = await this.downloadSnapshots(files, localState.remoteSnapshots, generatedAt);
    const merged = mergeSnapshots([...remote.snapshots, localSnapshot], this.deviceId, generatedAt);
    const [localDatasetHash, mergedDatasetHash, mergedSnapshotHash] = await Promise.all([
      hashDatasetContent(localSnapshot.records),
      hashDatasetContent(merged.records),
      hashSnapshotContent(merged),
    ]);

    const referencedBlobHashes = collectReferencedBlobHashes(merged.records);
    let transferredBlobs = 0;
    let transferredBytes = remote.bytes;
    for (const hash of referencedBlobHashes) {
      const bytes = dataset.blobs.get(hash);
      if (!bytes) continue;
      const fileName = blobFileName(hash);
      if (filesByName.has(fileName)) continue;
      const upload = await this.uploadEncrypted(fileName, bytes, `blob:${hash}`);
      filesByName.set(fileName, upload.file);
      transferredBlobs += 1;
      transferredBytes += upload.bytes;
    }

    const replacedLocal = localDatasetHash !== mergedDatasetHash;
    if (replacedLocal) {
      const blobCache = new Map(dataset.blobs);
      await this.dataSource.replace(merged.records, async (hash) => {
        const cached = blobCache.get(hash);
        if (cached) return cached;
        const file = filesByName.get(blobFileName(hash));
        if (!file) throw new Error(`Synced attachment blob is missing: ${hash}.`);
        const download = await this.downloadEncrypted(file, `blob:${hash}`);
        blobCache.set(hash, download.plaintext);
        transferredBlobs += 1;
        transferredBytes += download.bytes;
        return download.plaintext;
      });
    }
    await this.stateStore.put(merged);

    const snapshotName = snapshotFileName(this.deviceId);
    const existingSnapshot = filesByName.get(snapshotName);
    let uploadedSnapshot: string | null = null;
    if (!existingSnapshot || localState.lastSnapshotHash !== mergedSnapshotHash) {
      const upload = await this.uploadEncrypted(
        snapshotName,
        new TextEncoder().encode(JSON.stringify(merged)),
        `snapshot:${this.deviceId}`,
        existingSnapshot,
      );
      transferredBytes += upload.bytes;
      uploadedSnapshot = snapshotName;
      const fingerprint = remoteFingerprint(upload.file);
      if (fingerprint) {
        remote.cache[snapshotName] = { fileId: upload.file.id, fingerprint, snapshot: merged };
      }
    }

    const previousRevisionKeys = new Set([
      ...(previous?.revisions ?? []),
      ...remote.snapshots.flatMap((snapshot) => snapshot.revisions),
    ].map(revisionKey));
    const recordWinners = merged.records.filter((record) => {
      const local = localSnapshot.records.find((candidate) => entityKey(candidate) === entityKey(record));
      return !local || canonicalStringify(local) !== canonicalStringify(record);
    }).length;
    const nextState: SyncLocalState = {
      formatVersion: 1,
      hlc: merged.clock,
      lastDatasetHash: mergedDatasetHash,
      lastSnapshotHash: mergedSnapshotHash,
      remoteFileIndex: Object.fromEntries(files.map((file) => [
        file.name,
        { fileId: file.id, fingerprint: remoteFingerprint(file) ?? '' },
      ])),
      remoteSnapshots: remote.cache,
    };
    await this.stateStore.putLocalState?.(nextState);

    return {
      downloadedSnapshots: remote.downloaded,
      mergedRecords: merged.records.length,
      recordWinners,
      skippedRecords: merged.records.length - recordWinners,
      revisionsCreated: merged.revisions.filter((revision) => !previousRevisionKeys.has(revisionKey(revision))).length,
      transferredBlobs,
      transferredBytes,
      uploadedSnapshot,
      replacedLocal,
    };
  }

  private async downloadSnapshots(
    files: DriveAppDataFile[],
    cache: Record<string, RemoteSnapshotCacheEntry>,
    syncedAt: string,
  ): Promise<DownloadSnapshotResult> {
    const snapshotFiles = files.filter((file) => file.name.startsWith(SNAPSHOT_PREFIX) && file.name.endsWith('.bin'));
    const nextCache: Record<string, RemoteSnapshotCacheEntry> = {};
    const snapshots: DeviceSyncSnapshot[] = [];
    let bytes = 0;
    let downloaded = 0;

    for (const file of snapshotFiles) {
      const fingerprint = remoteFingerprint(file);
      const cached = fingerprint ? cache[file.name] : undefined;
      if (cached && cached.fileId === file.id && cached.fingerprint === fingerprint) {
        nextCache[file.name] = cached;
        snapshots.push(cached.snapshot);
        continue;
      }

      const remoteDeviceId = file.name.slice(SNAPSHOT_PREFIX.length, -'.bin'.length);
      const download = await this.downloadEncrypted(file, `snapshot:${remoteDeviceId}`);
      const snapshot = clampSnapshotClock(
        parseSnapshot(new TextDecoder().decode(download.plaintext)),
        file.modifiedTime,
        syncedAt,
      );
      snapshots.push(snapshot);
      bytes += download.bytes;
      downloaded += 1;
      if (fingerprint) nextCache[file.name] = { fileId: file.id, fingerprint, snapshot };
    }
    return { bytes, cache: nextCache, downloaded, snapshots };
  }

  private async downloadEncrypted(file: DriveAppDataFile, context: string) {
    const encrypted = await this.drive.downloadFile(file.id);
    if (!this.masterKey) {
      return { bytes: encrypted.byteLength, plaintext: encrypted };
    }
    const payload = parseEncryptedPayload(new TextDecoder().decode(encrypted));
    if (payload.context !== context) throw new Error(`Encrypted Drive file context mismatch: ${file.name}.`);
    return { bytes: encrypted.byteLength, plaintext: await decryptSyncPayload(this.masterKey, payload) };
  }

  private async uploadEncrypted(
    fileName: string,
    content: Uint8Array,
    context: string,
    existing?: DriveAppDataFile,
  ) {
    if (!this.writeKey) {
      const file = await this.drive.upsertFile(fileName, content, 'application/json', existing?.id);
      return { bytes: content.byteLength, file };
    }
    const payload = await encryptSyncPayload(this.writeKey, content, context);
    const encrypted = new TextEncoder().encode(JSON.stringify(payload));
    const file = await this.drive.upsertFile(fileName, encrypted, 'application/octet-stream', existing?.id);
    return { bytes: encrypted.byteLength, file };
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

async function hashDatasetContent(records: SyncEntityRecord[]) {
  const content = records
    .map((record) => ({
      deleted: record.deleted,
      entityType: record.entityType,
      id: record.id,
      value: record.value,
    }))
    .sort((first, second) => `${first.entityType}:${first.id}`.localeCompare(`${second.entityType}:${second.id}`));
  return sha256Hex(new TextEncoder().encode(canonicalStringify(content)));
}
async function hashSnapshotContent(snapshot: DeviceSyncSnapshot) {
  const content = {
    records: [...snapshot.records].sort((first, second) => entityKey(first).localeCompare(entityKey(second))),
    revisions: [...snapshot.revisions].sort((first, second) => revisionKey(first).localeCompare(revisionKey(second))),
  };
  return sha256Hex(new TextEncoder().encode(canonicalStringify(content)));
}

function collectReferencedBlobHashes(records: SyncEntityRecord[]) {
  const hashes = new Set<string>();
  for (const record of records) {
    if (record.deleted || !record.value) continue;
    const hash = record.value.blobHash;
    if (typeof hash === 'string' && hash) hashes.add(hash);
  }
  return hashes;
}

function createEmptyLocalState(): SyncLocalState {
  return { formatVersion: 1, remoteSnapshots: {} };
}

function remoteFingerprint(file: DriveAppDataFile) {
  if (!file.md5Checksum && !file.modifiedTime && !file.size) return undefined;
  return [file.md5Checksum ?? '', file.modifiedTime ?? '', file.size ?? ''].join(':');
}

function entityKey(record: Pick<SyncEntityRecord, 'entityType' | 'id'>) {
  return `${record.entityType}:${record.id}`;
}

function revisionKey(revision: DeviceSyncSnapshot['revisions'][number]) {
  return `${entityKey(revision)}:${revision.clock.wallTimeMs}:${revision.clock.counter}:${revision.clock.deviceId}`;
}

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function snapshotFileName(deviceId: string) {
  return `${SNAPSHOT_PREFIX}${deviceId}.bin`;
}

function blobFileName(hash: string) {
  return `${BLOB_PREFIX}${hash}.bin`;
}
