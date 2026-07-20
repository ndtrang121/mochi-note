import { describe, expect, it } from 'vitest';

import {
  buildLocalSnapshot,
  compareHybridTimestamps,
  compareVectors,
  mergeSnapshots,
  migrateSnapshot,
  type LegacyDeviceSyncSnapshot,
} from './snapshotMerge';
import type { DeviceSyncSnapshot, HybridTimestamp, SyncEntityRecord } from './syncTypes';

const BASE_TIME = '2026-07-20T00:00:00.000Z';

function clock(deviceId: string, wallTimeMs: number, counter = 0): HybridTimestamp {
  return { wallTimeMs, counter, deviceId };
}

function noteRecord(
  deviceId: string,
  title: string | null,
  recordClock: HybridTimestamp,
): SyncEntityRecord {
  const deleted = title === null;
  return {
    clock: recordClock,
    contentHash: deleted ? '' : title,
    deleted,
    entityType: 'note',
    id: 'note-1',
    modifiedAt: new Date(recordClock.wallTimeMs).toISOString(),
    originDeviceId: deviceId,
    value: deleted ? null : { id: 'note-1', title },
    version: { [deviceId]: 1 },
  };
}

function settingsRecord(
  deviceId: string,
  value: Record<string, unknown>,
  fieldClocks: Record<string, HybridTimestamp>,
): SyncEntityRecord {
  const latestClock = Object.values(fieldClocks).sort(compareHybridTimestamps).at(-1) ?? clock(deviceId, 0);
  return {
    clock: latestClock,
    contentHash: '',
    deleted: false,
    entityType: 'settings',
    fieldClocks,
    id: 'app-settings',
    modifiedAt: new Date(latestClock.wallTimeMs).toISOString(),
    originDeviceId: deviceId,
    value,
    version: { [deviceId]: 1 },
  };
}

function snapshot(deviceId: string, records: SyncEntityRecord[], revisions: DeviceSyncSnapshot['revisions'] = []): DeviceSyncSnapshot {
  const snapshotClock = records.map((record) => record.clock).sort(compareHybridTimestamps).at(-1) ?? clock(deviceId, 0);
  return { clock: snapshotClock, deviceId, formatVersion: 2, generatedAt: BASE_TIME, records, revisions };
}

describe('device snapshot merge', () => {
  it('tracks local changes and creates HLC tombstones for missing entities', async () => {
    const first = await buildLocalSnapshot([
      { entityType: 'note', id: 'note-1', value: { id: 'note-1', title: 'First', updatedAt: '2026-07-20T01:00:00.000Z' } },
    ], undefined, 'device-a', '2026-07-20T01:00:00.000Z');
    const unchanged = await buildLocalSnapshot([
      { entityType: 'note', id: 'note-1', value: { updatedAt: '2026-07-20T01:00:00.000Z', title: 'First', id: 'note-1' } },
    ], first, 'device-a', '2026-07-20T02:00:00.000Z');
    const deleted = await buildLocalSnapshot([], unchanged, 'device-a', '2026-07-20T03:00:00.000Z');

    expect(first.formatVersion).toBe(2);
    expect(unchanged.records[0].clock).toEqual(first.records[0].clock);
    expect(deleted.records[0]).toMatchObject({ deleted: true, value: null, version: { 'device-a': 2 } });
    expect(compareHybridTimestamps(deleted.records[0].clock, unchanged.records[0].clock)).toBeGreaterThan(0);
  });

  it('compares vector clocks for legacy compatibility', () => {
    expect(compareVectors({ a: 2, b: 1 }, { a: 1, b: 1 })).toBe(1);
    expect(compareVectors({ a: 1 }, { a: 1 })).toBe(0);
    expect(compareVectors({ a: 2 }, { b: 2 })).toBeNull();
  });

  it('keeps one newest record without a revision when content is identical', () => {
    const older = noteRecord('device-a', 'Same', clock('device-a', 100));
    const newer = noteRecord('device-b', 'Same', clock('device-b', 200));
    const merged = mergeSnapshots([snapshot('device-a', [older]), snapshot('device-b', [newer])], 'device-c', BASE_TIME);

    expect(merged.records[0]).toMatchObject({ ...newer, version: { 'device-a': 1, 'device-b': 1 } });
    expect(merged.revisions).toHaveLength(0);
  });

  it('uses HLC LWW and keeps different losing content as a 30-day revision', () => {
    const older = noteRecord('device-a', 'Draft A', clock('device-a', 100));
    const newer = noteRecord('device-b', 'Draft B', clock('device-b', 200));
    const mergedAt = '2026-07-20T04:00:00.000Z';
    const merged = mergeSnapshots([snapshot('device-a', [older]), snapshot('device-b', [newer])], 'device-c', mergedAt);

    expect(merged.records).toHaveLength(1);
    expect(merged.records[0].value).toMatchObject({ title: 'Draft B' });
    expect(merged.revisions).toHaveLength(1);
    expect(merged.revisions[0]).toMatchObject({ value: { id: 'note-1', title: 'Draft A' }, replacedAt: mergedAt });
    expect(merged.revisions[0].expiresAt).toBe('2026-08-19T04:00:00.000Z');
  });

  it('breaks equal wall times by counter and then device id', () => {
    const lowerCounter = noteRecord('device-z', 'Lower counter', clock('device-z', 100, 1));
    const higherCounter = noteRecord('device-a', 'Higher counter', clock('device-a', 100, 2));
    const deviceWinner = noteRecord('device-z', 'Device winner', clock('device-z', 100, 2));

    const counterMerged = mergeSnapshots([snapshot('device-z', [lowerCounter]), snapshot('device-a', [higherCounter])], 'device-c', BASE_TIME);
    const deviceMerged = mergeSnapshots([snapshot('device-a', [higherCounter]), snapshot('device-z', [deviceWinner])], 'device-c', BASE_TIME);

    expect(counterMerged.records[0].value).toMatchObject({ title: 'Higher counter' });
    expect(deviceMerged.records[0].value).toMatchObject({ title: 'Device winner' });
  });

  it('merges settings independently by key clock', () => {
    const first = settingsRecord('device-a', { language: 'vi', theme: 'light' }, {
      language: clock('device-a', 300),
      theme: clock('device-a', 100),
    });
    const second = settingsRecord('device-b', { language: 'en', theme: 'dark' }, {
      language: clock('device-b', 100),
      theme: clock('device-b', 300),
    });
    const merged = mergeSnapshots([snapshot('device-a', [first]), snapshot('device-b', [second])], 'device-c', BASE_TIME);

    expect(merged.records[0].value).toEqual({ language: 'vi', theme: 'dark' });
    expect(merged.revisions).toHaveLength(0);
  });

  it('lets the newest HLC decide between deletion and editing', () => {
    const edit = noteRecord('device-a', 'Restored', clock('device-a', 200));
    const newerDelete = noteRecord('device-b', null, clock('device-b', 300));
    const olderDelete = noteRecord('device-b', null, clock('device-b', 100));

    expect(mergeSnapshots([snapshot('device-a', [edit]), snapshot('device-b', [newerDelete])], 'device-c', BASE_TIME).records[0].deleted).toBe(true);
    expect(mergeSnapshots([snapshot('device-a', [edit]), snapshot('device-b', [olderDelete])], 'device-c', BASE_TIME).records[0].deleted).toBe(false);
  });

  it('migrates v1 snapshots and expires old revisions', () => {
    const legacy: LegacyDeviceSyncSnapshot = {
      deviceId: 'device-a',
      formatVersion: 1,
      generatedAt: BASE_TIME,
      records: [{
        deleted: false,
        entityType: 'note',
        id: 'note-1',
        modifiedAt: '2026-07-20T01:00:00.000Z',
        originDeviceId: 'device-a',
        value: { id: 'note-1', title: 'Legacy' },
        version: { 'device-a': 3 },
      }],
    };
    const migrated = migrateSnapshot(legacy, 'fallback', BASE_TIME);
    const expiredRevision = {
      ...noteRecord('device-z', 'Expired', clock('device-z', 50)),
      expiresAt: '2026-07-19T00:00:00.000Z',
      reason: 'lww-replaced' as const,
      replacedAt: '2026-06-19T00:00:00.000Z',
    };
    const merged = mergeSnapshots([snapshot('device-a', migrated.records, [expiredRevision])], 'device-b', BASE_TIME);

    expect(migrated).toMatchObject({ formatVersion: 2, revisions: [] });
    expect(migrated.records[0].clock).toMatchObject({ counter: 3, deviceId: 'device-a' });
    expect(merged.revisions).toHaveLength(0);
  });
});
