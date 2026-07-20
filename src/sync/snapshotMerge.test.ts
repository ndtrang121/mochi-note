import { describe, expect, it } from 'vitest';

import { buildLocalSnapshot, compareVectors, mergeSnapshots } from './snapshotMerge';
import type { DeviceSyncSnapshot, SyncEntityRecord } from './syncTypes';

function noteRecord(
  deviceId: string,
  title: string,
  version: Record<string, number>,
  modifiedAt: string,
): SyncEntityRecord {
  return {
    deleted: false,
    entityType: 'note',
    id: 'note-1',
    modifiedAt,
    originDeviceId: deviceId,
    value: { id: 'note-1', title, updatedAt: modifiedAt },
    version,
  };
}

function snapshot(deviceId: string, records: SyncEntityRecord[]): DeviceSyncSnapshot {
  return { deviceId, formatVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', records };
}

describe('device snapshot merge', () => {
  it('tracks local changes and creates tombstones for missing entities', async () => {
    const first = await buildLocalSnapshot([
      { entityType: 'note', id: 'note-1', value: { id: 'note-1', title: 'First', updatedAt: '2026-07-20T01:00:00.000Z' } },
    ], undefined, 'device-a', '2026-07-20T01:00:00.000Z');
    const unchanged = await buildLocalSnapshot([
      { entityType: 'note', id: 'note-1', value: { updatedAt: '2026-07-20T01:00:00.000Z', title: 'First', id: 'note-1' } },
    ], first, 'device-a', '2026-07-20T02:00:00.000Z');
    const deleted = await buildLocalSnapshot([], unchanged, 'device-a', '2026-07-20T03:00:00.000Z');

    expect(first.records[0].version).toEqual({ 'device-a': 1 });
    expect(unchanged.records[0].version).toEqual({ 'device-a': 1 });
    expect(deleted.records[0]).toMatchObject({ deleted: true, value: null, version: { 'device-a': 2 } });
  });

  it('compares dominating, equal, and concurrent vectors', () => {
    expect(compareVectors({ a: 2, b: 1 }, { a: 1, b: 1 })).toBe(1);
    expect(compareVectors({ a: 1 }, { a: 1 })).toBe(0);
    expect(compareVectors({ a: 2 }, { b: 2 })).toBeNull();
  });

  it('keeps the deterministic winner and a conflict copy for concurrent edits', () => {
    const merged = mergeSnapshots([
      snapshot('device-a', [noteRecord('device-a', 'Draft A', { 'device-a': 2 }, '2026-07-20T02:00:00.000Z')]),
      snapshot('device-b', [noteRecord('device-b', 'Draft B', { 'device-b': 1 }, '2026-07-20T03:00:00.000Z')]),
    ], 'device-c', '2026-07-20T04:00:00.000Z');

    expect(merged.records).toHaveLength(2);
    expect(merged.records.find((record) => record.id === 'note-1')?.value).toMatchObject({ title: 'Draft B' });
    expect(merged.records.find((record) => record.id !== 'note-1')?.value).toMatchObject({ title: 'Draft A (Xung đột)' });
    expect(merged.records[0].version).toMatchObject({ 'device-a': 2, 'device-b': 1, 'device-c': 1 });
  });

  it('keeps a tombstone and recovers a concurrent edit as a conflict copy', () => {
    const deleted: SyncEntityRecord = {
      ...noteRecord('device-a', 'Old', { 'device-a': 2 }, '2026-07-20T02:00:00.000Z'),
      deleted: true,
      value: null,
    };
    const merged = mergeSnapshots([
      snapshot('device-a', [deleted]),
      snapshot('device-b', [noteRecord('device-b', 'Offline edit', { 'device-b': 1 }, '2026-07-20T03:00:00.000Z')]),
    ], 'device-c', '2026-07-20T04:00:00.000Z');

    expect(merged.records.find((record) => record.id === 'note-1')).toMatchObject({ deleted: true });
    expect(merged.records.find((record) => record.id !== 'note-1')?.value).toMatchObject({ title: 'Offline edit (Xung đột)' });
  });
});
