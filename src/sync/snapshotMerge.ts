import { sha256Hex } from './syncCrypto';
import type {
  DeviceSyncSnapshot,
  HybridTimestamp,
  LocalSyncEntity,
  SyncEntityRecord,
  SyncRevision,
  VersionVector,
} from './syncTypes';

const SNAPSHOT_FORMAT_VERSION = 2;
const REVISION_RETENTION_DAYS = 30;

export async function buildLocalSnapshot(
  entities: LocalSyncEntity[],
  previous: DeviceSyncSnapshot | undefined,
  deviceId: string,
  generatedAt: string,
): Promise<DeviceSyncSnapshot> {
  const previousByKey = new Map(previous?.records.map((record) => [recordKey(record), record]) ?? []);
  const records: SyncEntityRecord[] = [];
  let localClock = normalizeClock(previous?.clock, deviceId, generatedAt);

  for (const entity of entities) {
    const key = recordKey(entity);
    const prior = previousByKey.get(key);
    previousByKey.delete(key);
    const unchanged = prior && !prior.deleted && await valuesMatch(prior.value, entity.value);
    if (unchanged) {
      records.push({ ...prior, contentHash: prior.contentHash || await contentHash(entity.value) });
      localClock = observeHybridClock(localClock, prior.clock, deviceId, generatedAt);
      continue;
    }

    const record = entity.entityType === 'settings'
      ? await buildSettingsRecord(entity, prior, deviceId, generatedAt, localClock)
      : await buildEntityRecord(entity, prior, deviceId, generatedAt, nextHybridClock(localClock, generatedAt, deviceId));
    records.push(record.record);
    localClock = record.clock;
  }

  // Missing entities remain tombstones so a stale device cannot resurrect them.
  for (const prior of previousByKey.values()) {
    if (prior.deleted) {
      records.push(prior);
      localClock = observeHybridClock(localClock, prior.clock, deviceId, generatedAt);
      continue;
    }
    const clock = nextHybridClock(localClock, generatedAt, deviceId);
    records.push({
      ...prior,
      clock,
      contentHash: '',
      deleted: true,
      modifiedAt: generatedAt,
      originDeviceId: deviceId,
      value: null,
      version: incrementVector(prior.version, deviceId),
    });
    localClock = clock;
  }

  return {
    clock: localClock,
    deviceId,
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    generatedAt,
    records: records.sort(compareRecordKey),
    revisions: (previous?.revisions ?? []).filter((revision) => revision.expiresAt > generatedAt),
  };
}

export function mergeSnapshots(
  snapshots: Array<DeviceSyncSnapshot | LegacyDeviceSyncSnapshot>,
  mergerDeviceId: string,
  mergedAt: string,
): DeviceSyncSnapshot {
  const merged = new Map<string, SyncEntityRecord>();
  const revisions = new Map<string, SyncRevision>();
  let mergedClock = normalizeClock(undefined, mergerDeviceId, mergedAt);
  const orderedSnapshots = snapshots
    .map((snapshot) => migrateSnapshot(snapshot, mergerDeviceId, mergedAt))
    .sort((first, second) => first.deviceId.localeCompare(second.deviceId));

  for (const snapshot of orderedSnapshots) {
    validateSnapshot(snapshot);
    mergedClock = observeHybridClock(mergedClock, snapshot.clock, mergerDeviceId, mergedAt);
    for (const revision of snapshot.revisions) {
      if (revision.expiresAt > mergedAt) revisions.set(revisionKey(revision), revision);
    }
    for (const incoming of snapshot.records) {
      const key = recordKey(incoming);
      const current = merged.get(key);
      if (!current) {
        merged.set(key, incoming);
        continue;
      }
      const resolution = resolveRecords(current, incoming, mergerDeviceId, mergedAt, mergedClock);
      merged.set(key, resolution.primary);
      mergedClock = resolution.clock;
      if (resolution.revision) revisions.set(revisionKey(resolution.revision), resolution.revision);
    }
  }

  return {
    clock: mergedClock,
    deviceId: mergerDeviceId,
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    generatedAt: mergedAt,
    records: Array.from(merged.values()).sort(compareRecordKey),
    revisions: Array.from(revisions.values()).filter((revision) => revision.expiresAt > mergedAt),
  };
}

export interface LegacyDeviceSyncSnapshot {
  deviceId: string;
  formatVersion: 1;
  generatedAt: string;
  records: Array<LegacySyncEntityRecord>;
}

interface LegacySyncEntityRecord {
  deleted: boolean;
  entityType: SyncEntityRecord['entityType'];
  id: string;
  modifiedAt: string;
  originDeviceId: string;
  value: Record<string, unknown> | null;
  version: VersionVector;
}

export function migrateSnapshot(
  snapshot: DeviceSyncSnapshot | LegacyDeviceSyncSnapshot,
  fallbackDeviceId: string,
  fallbackTime: string,
): DeviceSyncSnapshot {
  if (snapshot.formatVersion === SNAPSHOT_FORMAT_VERSION) return snapshot;
  if (snapshot.formatVersion !== 1) throw new Error('Unsupported device sync snapshot.');
  const records = snapshot.records.map((record) => {
    const modifiedAt = validIsoDate(record.modifiedAt)
      ? record.modifiedAt
      : validIsoDate(snapshot.generatedAt) ? snapshot.generatedAt : fallbackTime;
    const clock: HybridTimestamp = {
      wallTimeMs: Date.parse(modifiedAt),
      counter: Math.max(...Object.values(record.version), 0),
      deviceId: record.originDeviceId || snapshot.deviceId || fallbackDeviceId,
    };
    return {
      ...record,
      clock,
      contentHash: '',
    };
  });
  const clock = records.reduce(
    (current, record) => compareHybridTimestamps(current, record.clock) >= 0 ? current : record.clock,
    normalizeClock(undefined, snapshot.deviceId || fallbackDeviceId, fallbackTime),
  );
  return {
    clock,
    deviceId: snapshot.deviceId || fallbackDeviceId,
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    generatedAt: validIsoDate(snapshot.generatedAt) ? snapshot.generatedAt : fallbackTime,
    records,
    revisions: [],
  };
}

export function compareHybridTimestamps(first: HybridTimestamp, second: HybridTimestamp) {
  if (first.wallTimeMs !== second.wallTimeMs) return first.wallTimeMs > second.wallTimeMs ? 1 : -1;
  if (first.counter !== second.counter) return first.counter > second.counter ? 1 : -1;
  return first.deviceId.localeCompare(second.deviceId);
}
export function compareVectors(first: VersionVector, second: VersionVector): 1 | 0 | -1 | null {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  let firstGreater = false;
  let secondGreater = false;
  for (const key of keys) {
    const left = first[key] ?? 0;
    const right = second[key] ?? 0;
    if (left > right) firstGreater = true;
    if (right > left) secondGreater = true;
  }
  if (firstGreater && secondGreater) return null;
  if (firstGreater) return 1;
  if (secondGreater) return -1;
  return 0;
}

function resolveRecords(
  first: SyncEntityRecord,
  second: SyncEntityRecord,
  mergerDeviceId: string,
  mergedAt: string,
  currentClock: HybridTimestamp,
) {
  if (first.entityType === 'settings' && second.entityType === 'settings') {
    const merged = mergeSettings(first, second, mergerDeviceId, mergedAt);
    return { clock: observeHybridClock(currentClock, merged.clock, mergerDeviceId, mergedAt), primary: merged };
  }

  const comparison = compareRecords(first, second);
  const winner = comparison >= 0 ? first : second;
  const loser = winner === first ? second : first;
  const clock = observeHybridClock(currentClock, winner.clock, mergerDeviceId, mergedAt);
  if (sameContent(first, second)) {
    return { clock, primary: { ...winner, version: mergeVectors(first.version, second.version) } };
  }
  return {
    clock,
    primary: { ...winner, version: mergeVectors(first.version, second.version) },
    revision: createRevision(loser, mergedAt),
  };
}

function mergeSettings(
  first: SyncEntityRecord,
  second: SyncEntityRecord,
  mergerDeviceId: string,
  mergedAt: string,
): SyncEntityRecord {
  const values: Record<string, unknown> = {};
  const fieldClocks: Record<string, HybridTimestamp> = {};
  const keys = new Set([...Object.keys(first.value ?? {}), ...Object.keys(second.value ?? {})]);
  for (const key of keys) {
    const firstClock = first.fieldClocks?.[key] ?? first.clock;
    const secondClock = second.fieldClocks?.[key] ?? second.clock;
    const winner = compareHybridTimestamps(firstClock, secondClock) >= 0 ? first : second;
    const winnerClock = winner === first ? firstClock : secondClock;
    if (winner.value && key in winner.value) values[key] = winner.value[key];
    fieldClocks[key] = winnerClock;
  }
  const clock = Object.values(fieldClocks).reduce(
    (current, candidate) => compareHybridTimestamps(current, candidate) >= 0 ? current : candidate,
    first.clock,
  );
  return {
    ...first,
    clock: { ...clock, deviceId: mergerDeviceId },
    contentHash: '',
    fieldClocks,
    modifiedAt: Number.isFinite(clock.wallTimeMs) ? new Date(clock.wallTimeMs).toISOString() : mergedAt,
    originDeviceId: mergerDeviceId,
    value: values,
    version: mergeVectors(first.version, second.version),
  };
}

async function buildEntityRecord(
  entity: LocalSyncEntity,
  prior: SyncEntityRecord | undefined,
  deviceId: string,
  generatedAt: string,
  clock: HybridTimestamp,
) {
  const record: SyncEntityRecord = {
    clock,
    contentHash: await contentHash(entity.value),
    deleted: false,
    entityType: entity.entityType,
    id: entity.id,
    modifiedAt: entityModifiedAt(entity.value, generatedAt),
    originDeviceId: deviceId,
    value: entity.value,
    version: incrementVector(prior?.version ?? {}, deviceId),
  };
  return { clock, record };
}

async function buildSettingsRecord(
  entity: LocalSyncEntity,
  prior: SyncEntityRecord | undefined,
  deviceId: string,
  generatedAt: string,
  startingClock: HybridTimestamp,
) {
  let clock = startingClock;
  const fieldClocks: Record<string, HybridTimestamp> = {};
  const keys = new Set([...Object.keys(prior?.value ?? {}), ...Object.keys(entity.value)]);
  for (const key of keys) {
    if (prior?.value && canonicalStringify(prior.value[key]) === canonicalStringify(entity.value[key])) {
      fieldClocks[key] = prior.fieldClocks?.[key] ?? prior.clock;
    } else {
      clock = nextHybridClock(clock, generatedAt, deviceId);
      fieldClocks[key] = clock;
    }
  }
  const record: SyncEntityRecord = {
    clock,
    contentHash: await contentHash(entity.value),
    deleted: false,
    entityType: entity.entityType,
    fieldClocks,
    id: entity.id,
    modifiedAt: entityModifiedAt(entity.value, generatedAt),
    originDeviceId: deviceId,
    value: entity.value,
    version: incrementVector(prior?.version ?? {}, deviceId),
  };
  return { clock, record };
}

function createRevision(record: SyncEntityRecord, replacedAt: string): SyncRevision | undefined {

  const replacedTime = Date.parse(replacedAt);
  if (!Number.isFinite(replacedTime)) return undefined;
  return {
    clock: record.clock,
    contentHash: record.contentHash,
    deleted: record.deleted,
    entityType: record.entityType,
    expiresAt: new Date(replacedTime + REVISION_RETENTION_DAYS * 86_400_000).toISOString(),
    id: record.id,
    modifiedAt: record.modifiedAt,
    originDeviceId: record.originDeviceId,
    reason: 'lww-replaced',
    replacedAt,
    value: record.value,
  };
}

function compareRecords(first: SyncEntityRecord, second: SyncEntityRecord) {
  const clockComparison = compareHybridTimestamps(first.clock, second.clock);
  if (clockComparison !== 0) return clockComparison;
  const hashComparison = (first.contentHash || canonicalStringify(first.value)).localeCompare(second.contentHash || canonicalStringify(second.value));
  if (hashComparison !== 0) return hashComparison;
  return first.originDeviceId.localeCompare(second.originDeviceId);
}

function sameContent(first: SyncEntityRecord, second: SyncEntityRecord) {
  return canonicalStringify(first.value) === canonicalStringify(second.value) && first.deleted === second.deleted;
}

function nextHybridClock(previous: HybridTimestamp, generatedAt: string, deviceId: string): HybridTimestamp {
  const wallTimeMs = Math.max(previous.wallTimeMs, Date.parse(generatedAt));
  return {
    wallTimeMs: Number.isFinite(wallTimeMs) ? wallTimeMs : previous.wallTimeMs,
    counter: wallTimeMs === previous.wallTimeMs ? previous.counter + 1 : 0,
    deviceId,
  };
}

function observeHybridClock(current: HybridTimestamp, observed: HybridTimestamp, deviceId: string, generatedAt: string) {
  const base = compareHybridTimestamps(current, observed) >= 0 ? current : observed;
  return nextHybridClock(base, generatedAt, deviceId);
}

function normalizeClock(clock: HybridTimestamp | undefined, deviceId: string, generatedAt: string) {
  return clock && Number.isFinite(clock.wallTimeMs)
    ? { ...clock, deviceId: clock.deviceId || deviceId }
    : { wallTimeMs: Date.parse(generatedAt), counter: 0, deviceId };
}

function mergeVectors(first: VersionVector, second: VersionVector) {
  const merged: VersionVector = { ...first };
  for (const [deviceId, value] of Object.entries(second)) merged[deviceId] = Math.max(merged[deviceId] ?? 0, value);
  return merged;
}

function incrementVector(vector: VersionVector, deviceId: string) {
  return { ...vector, [deviceId]: (vector[deviceId] ?? 0) + 1 };
}

async function valuesMatch(first: Record<string, unknown> | null, second: Record<string, unknown>) {
  if (!first) return false;
  const [firstHash, secondHash] = await Promise.all([contentHash(first), contentHash(second)]);
  return firstHash === secondHash;
}

async function contentHash(value: unknown) {
  return sha256Hex(new TextEncoder().encode(canonicalStringify(value)));
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

function entityModifiedAt(value: Record<string, unknown>, fallback: string) {
  return typeof value.updatedAt === 'string' && validIsoDate(value.updatedAt) ? value.updatedAt : fallback;
}

function recordKey(record: Pick<SyncEntityRecord, 'entityType' | 'id'>) {
  return `${record.entityType}:${record.id}`;
}

function revisionKey(revision: SyncRevision) {
  return `${recordKey(revision)}:${revision.clock.wallTimeMs}:${revision.clock.counter}:${revision.clock.deviceId}`;
}

function compareRecordKey(first: SyncEntityRecord, second: SyncEntityRecord) {
  return recordKey(first).localeCompare(recordKey(second));
}

function validIsoDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

function validateSnapshot(snapshot: DeviceSyncSnapshot) {
  if (snapshot.formatVersion !== SNAPSHOT_FORMAT_VERSION || !snapshot.deviceId || !Array.isArray(snapshot.records)) {
    throw new Error('Unsupported device sync snapshot.');
  }
}
