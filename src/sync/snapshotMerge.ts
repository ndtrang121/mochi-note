import { sha256Hex } from './syncCrypto';
import type {
  DeviceSyncSnapshot,
  LocalSyncEntity,
  SyncEntityRecord,
  VersionVector,
} from './syncTypes';

export async function buildLocalSnapshot(
  entities: LocalSyncEntity[],
  previous: DeviceSyncSnapshot | undefined,
  deviceId: string,
  generatedAt: string,
): Promise<DeviceSyncSnapshot> {
  const previousByKey = new Map(previous?.records.map((record) => [recordKey(record), record]) ?? []);
  const records: SyncEntityRecord[] = [];

  for (const entity of entities) {
    const key = recordKey(entity);
    const prior = previousByKey.get(key);
    previousByKey.delete(key);
    const unchanged = prior && !prior.deleted && await valuesMatch(prior.value, entity.value);
    records.push(unchanged ? prior : {
      deleted: false,
      entityType: entity.entityType,
      id: entity.id,
      modifiedAt: entityModifiedAt(entity.value, generatedAt),
      originDeviceId: deviceId,
      value: entity.value,
      version: incrementVector(prior?.version ?? {}, deviceId),
    });
  }

  // Missing local entities become durable tombstones so stale devices cannot resurrect them.
  for (const prior of previousByKey.values()) {
    records.push(prior.deleted ? prior : {
      ...prior,
      deleted: true,
      modifiedAt: generatedAt,
      originDeviceId: deviceId,
      value: null,
      version: incrementVector(prior.version, deviceId),
    });
  }

  return {
    deviceId,
    formatVersion: 1,
    generatedAt,
    records: records.sort(compareRecordKey),
  };
}

export function mergeSnapshots(
  snapshots: DeviceSyncSnapshot[],
  mergerDeviceId: string,
  mergedAt: string,
): DeviceSyncSnapshot {
  const merged = new Map<string, SyncEntityRecord>();
  const orderedSnapshots = [...snapshots].sort((first, second) => first.deviceId.localeCompare(second.deviceId));

  for (const snapshot of orderedSnapshots) {
    validateSnapshot(snapshot);
    for (const incoming of snapshot.records) {
      const key = recordKey(incoming);
      const current = merged.get(key);
      if (!current) {
        merged.set(key, incoming);
        continue;
      }
      const resolution = resolveRecords(current, incoming, mergerDeviceId, mergedAt);
      merged.set(key, resolution.primary);
      if (resolution.conflict) merged.set(recordKey(resolution.conflict), resolution.conflict);
    }
  }

  return {
    deviceId: mergerDeviceId,
    formatVersion: 1,
    generatedAt: mergedAt,
    records: Array.from(merged.values()).sort(compareRecordKey),
  };
}

export function compareVectors(first: VersionVector, second: VersionVector) {
  const deviceIds = new Set([...Object.keys(first), ...Object.keys(second)]);
  let firstAhead = false;
  let secondAhead = false;
  for (const deviceId of deviceIds) {
    const firstValue = first[deviceId] ?? 0;
    const secondValue = second[deviceId] ?? 0;
    if (firstValue > secondValue) firstAhead = true;
    if (secondValue > firstValue) secondAhead = true;
  }
  if (firstAhead && !secondAhead) return 1;
  if (secondAhead && !firstAhead) return -1;
  if (!firstAhead && !secondAhead) return 0;
  return null;
}

function resolveRecords(
  first: SyncEntityRecord,
  second: SyncEntityRecord,
  mergerDeviceId: string,
  mergedAt: string,
) {
  const comparison = compareVectors(first.version, second.version);
  if (comparison === 1) return { primary: first };
  if (comparison === -1) return { primary: second };
  if (comparison === 0) return { primary: deterministicWinner(first, second) };

  const resolvedVector = incrementVector(mergeVectors(first.version, second.version), mergerDeviceId);
  if (first.deleted || second.deleted) {
    const edited = first.deleted ? second : first;
    const primary: SyncEntityRecord = {
      ...(first.deleted ? first : second),
      modifiedAt: mergedAt,
      originDeviceId: mergerDeviceId,
      version: resolvedVector,
    };
    return {
      conflict: edited.deleted ? undefined : createConflictCopy(edited, resolvedVector, mergerDeviceId, mergedAt),
      primary,
    };
  }

  const winner = deterministicWinner(first, second);
  const loser = winner === first ? second : first;
  return {
    conflict: createConflictCopy(loser, resolvedVector, mergerDeviceId, mergedAt),
    primary: {
      ...winner,
      modifiedAt: mergedAt,
      originDeviceId: mergerDeviceId,
      version: resolvedVector,
    },
  };
}

function createConflictCopy(
  source: SyncEntityRecord,
  version: VersionVector,
  mergerDeviceId: string,
  mergedAt: string,
): SyncEntityRecord | undefined {
  if (!source.value || source.entityType === 'settings' || source.entityType === 'attachment') return undefined;
  const suffix = `${source.originDeviceId}-${Math.max(...Object.values(source.version), 0)}`;
  const id = `${source.id}-conflict-${suffix}`;
  const value: Record<string, unknown> = { ...source.value, id, updatedAt: mergedAt };
  if (typeof value.title === 'string') value.title = `${value.title} (Xung đột)`;
  if (typeof value.name === 'string') value.name = `${value.name} (Xung đột)`;
  return {
    deleted: false,
    entityType: source.entityType,
    id,
    modifiedAt: mergedAt,
    originDeviceId: mergerDeviceId,
    value,
    version,
  };
}

function deterministicWinner(first: SyncEntityRecord, second: SyncEntityRecord) {
  const timeComparison = first.modifiedAt.localeCompare(second.modifiedAt);
  if (timeComparison !== 0) return timeComparison > 0 ? first : second;
  const deviceComparison = first.originDeviceId.localeCompare(second.originDeviceId);
  if (deviceComparison !== 0) return deviceComparison > 0 ? first : second;
  return canonicalStringify(first.value).localeCompare(canonicalStringify(second.value)) >= 0 ? first : second;
}

function mergeVectors(first: VersionVector, second: VersionVector) {
  const merged: VersionVector = { ...first };
  for (const [deviceId, value] of Object.entries(second)) {
    merged[deviceId] = Math.max(merged[deviceId] ?? 0, value);
  }
  return merged;
}

function incrementVector(vector: VersionVector, deviceId: string) {
  return { ...vector, [deviceId]: (vector[deviceId] ?? 0) + 1 };
}

async function valuesMatch(first: Record<string, unknown> | null, second: Record<string, unknown>) {
  if (!first) return false;
  const [firstHash, secondHash] = await Promise.all([
    sha256Hex(new TextEncoder().encode(canonicalStringify(first))),
    sha256Hex(new TextEncoder().encode(canonicalStringify(second))),
  ]);
  return firstHash === secondHash;
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
  return typeof value.updatedAt === 'string' ? value.updatedAt : fallback;
}

function recordKey(record: Pick<SyncEntityRecord, 'entityType' | 'id'>) {
  return `${record.entityType}:${record.id}`;
}

function compareRecordKey(first: SyncEntityRecord, second: SyncEntityRecord) {
  return recordKey(first).localeCompare(recordKey(second));
}

function validateSnapshot(snapshot: DeviceSyncSnapshot) {
  if (snapshot.formatVersion !== 1 || !snapshot.deviceId || !Array.isArray(snapshot.records)) {
    throw new Error('Unsupported device sync snapshot.');
  }
}
