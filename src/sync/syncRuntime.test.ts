import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRIVE_SYNC_ALARM_NAME,
  DRIVE_SYNC_DEBOUNCE_ALARM_NAME,
  DRIVE_SYNC_DEBOUNCE_MILLISECONDS,
  DRIVE_SYNC_INTERVAL_MINUTES,
  ensureDriveSyncAlarm,
  isDriveSyncAlarm,
  requestDriveSyncSoon,
} from './syncRuntime';

describe('Drive sync scheduling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the periodic alarm separate from debounced change delivery', async () => {
    const create = vi.fn<(name: string, options: Record<string, number>) => Promise<void>>();
    create.mockResolvedValue();
    const get = vi.fn<(name: string) => Promise<unknown>>();
    get.mockResolvedValue(undefined);
    vi.stubGlobal('browser', { alarms: { create, get } });
    const beforeRequest = Date.now();

    await ensureDriveSyncAlarm();
    await requestDriveSyncSoon();

    expect(create).toHaveBeenNthCalledWith(1, DRIVE_SYNC_ALARM_NAME, {
      delayInMinutes: DRIVE_SYNC_INTERVAL_MINUTES,
      periodInMinutes: DRIVE_SYNC_INTERVAL_MINUTES,
    });
    expect(create.mock.calls[1]?.[0]).toBe(DRIVE_SYNC_DEBOUNCE_ALARM_NAME);
    const debounceOptions = create.mock.calls[1]?.[1];
    expect(debounceOptions?.when).toBeGreaterThanOrEqual(beforeRequest + DRIVE_SYNC_DEBOUNCE_MILLISECONDS);
    expect(isDriveSyncAlarm(DRIVE_SYNC_ALARM_NAME)).toBe(true);
    expect(isDriveSyncAlarm(DRIVE_SYNC_DEBOUNCE_ALARM_NAME)).toBe(true);
    expect(isDriveSyncAlarm('mochi-reminder:one')).toBe(false);
  });

  it('does not recreate an existing periodic alarm', async () => {
    const create = vi.fn<(name: string, options: Record<string, number>) => Promise<void>>();
    const get = vi.fn<(name: string) => Promise<unknown>>();
    get.mockResolvedValue({ name: DRIVE_SYNC_ALARM_NAME });
    vi.stubGlobal('browser', { alarms: { create, get } });

    await ensureDriveSyncAlarm();

    expect(create).not.toHaveBeenCalled();
  });
});