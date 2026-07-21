import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRIVE_SYNC_ALARM_NAME,
  DRIVE_SYNC_DEBOUNCE_ALARM_NAME,
  DRIVE_SYNC_DEBOUNCE_MILLISECONDS,
  DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY,
  DRIVE_SYNC_INTERVAL_MINUTES,
  DRIVE_SYNC_REQUEST_MESSAGE_TYPE,
  DRIVE_SYNC_RUNTIME_MESSAGE_TYPE,
  broadcastDriveSyncRuntimeState,
  ensureDriveSyncAlarm,
  getBackgroundDriveSyncDiagnostics,
  isBackgroundDriveSyncDiagnostics,
  isDriveSyncAlarm,
  isDriveSyncRequestMessage,
  isDriveSyncRuntimeMessage,
  listenForBackgroundDriveSyncDiagnostics,
  listenForDriveSyncRuntimeState,
  recordBackgroundDriveSyncDiagnostics,
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

  it('requests immediate background sync and keeps an alarm fallback', async () => {
    const create = vi.fn<(name: string, options: Record<string, number>) => Promise<void>>();
    const sendMessage = vi.fn<(message: unknown) => Promise<void>>();
    const store: Record<string, unknown> = {};
    const get = vi.fn((key: string) => Promise.resolve({ [key]: store[key] }));
    const set = vi.fn((value: Record<string, unknown>) => {
      Object.assign(store, value);
      return Promise.resolve();
    });
    create.mockResolvedValue();
    sendMessage.mockResolvedValue();
    vi.stubGlobal('browser', { alarms: { create }, runtime: { sendMessage }, storage: { local: { get, set } } });

    await requestDriveSyncSoon();

    expect(create).toHaveBeenCalledWith(DRIVE_SYNC_DEBOUNCE_ALARM_NAME, expect.objectContaining({
      when: expect.any(Number),
    }));
    expect(sendMessage).toHaveBeenCalledWith({
      reason: 'local-change',
      type: DRIVE_SYNC_REQUEST_MESSAGE_TYPE,
    });
    expect(isDriveSyncRequestMessage(sendMessage.mock.calls[0]?.[0])).toBe(true);
    expect(isBackgroundDriveSyncDiagnostics(store[DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY])).toBe(true);
    expect(await getBackgroundDriveSyncDiagnostics()).toMatchObject({
      phase: 'requested',
      trigger: 'request',
    });
  });

  it('keeps the alarm fallback when immediate background messaging is unavailable', async () => {
    const create = vi.fn<(name: string, options: Record<string, number>) => Promise<void>>();
    const sendMessage = vi.fn<(message: unknown) => Promise<void>>();
    create.mockResolvedValue();
    sendMessage.mockRejectedValue(new Error('No receiver'));
    vi.stubGlobal('browser', { alarms: { create }, runtime: { sendMessage } });

    await expect(requestDriveSyncSoon()).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledWith(DRIVE_SYNC_DEBOUNCE_ALARM_NAME, expect.objectContaining({
      when: expect.any(Number),
    }));
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('persists and publishes background diagnostics updates', async () => {
    const listeners: Array<(changes: Record<string, { newValue?: unknown }>, areaName: string) => void> = [];
    const store: Record<string, unknown> = {};
    const get = vi.fn((key: string) => Promise.resolve({ [key]: store[key] }));
    const set = vi.fn((value: Record<string, unknown>) => {
      Object.assign(store, value);
      listeners.forEach((listener) => listener({
        [DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY]: { newValue: value[DRIVE_SYNC_DIAGNOSTICS_STORAGE_KEY] },
      }, 'local'));
      return Promise.resolve();
    });
    const addListener = vi.fn((listener: (changes: Record<string, { newValue?: unknown }>, areaName: string) => void) => {
      listeners.push(listener);
    });
    const removeListener = vi.fn();
    vi.stubGlobal('browser', { storage: { local: { get, set }, onChanged: { addListener, removeListener } } });
    const received: unknown[] = [];

    const unsubscribe = listenForBackgroundDriveSyncDiagnostics((diagnostics) => received.push(diagnostics));
    await recordBackgroundDriveSyncDiagnostics({
      phase: 'syncing',
      startedAt: '2026-07-21T08:00:00.000Z',
      trigger: 'message',
    });
    unsubscribe();

    expect(await getBackgroundDriveSyncDiagnostics()).toMatchObject({
      phase: 'syncing',
      startedAt: '2026-07-21T08:00:00.000Z',
      trigger: 'message',
    });
    expect(received).toHaveLength(1);
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('does not recreate an existing periodic alarm', async () => {
    const create = vi.fn<(name: string, options: Record<string, number>) => Promise<void>>();
    const get = vi.fn<(name: string) => Promise<unknown>>();
    get.mockResolvedValue({ name: DRIVE_SYNC_ALARM_NAME });
    vi.stubGlobal('browser', { alarms: { create, get } });

    await ensureDriveSyncAlarm();

    expect(create).not.toHaveBeenCalled();
  });

  it('broadcasts Drive sync runtime state to open extension surfaces', async () => {
    const listeners: Array<(message: unknown) => void> = [];
    const sendMessage = vi.fn<(message: unknown) => Promise<void>>();
    sendMessage.mockResolvedValue();
    const addListener = vi.fn((listener: (message: unknown) => void) => {
      listeners.push(listener);
    });
    const removeListener = vi.fn((listener: (message: unknown) => void) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    });
    vi.stubGlobal('browser', {
      runtime: {
        onMessage: { addListener, removeListener },
        sendMessage,
      },
    });
    const received: unknown[] = [];

    const unsubscribe = listenForDriveSyncRuntimeState((message) => received.push(message));
    listeners[0]?.({ phase: 'synced', type: DRIVE_SYNC_RUNTIME_MESSAGE_TYPE });
    listeners[0]?.({ phase: 'synced', type: 'other-message' });
    await broadcastDriveSyncRuntimeState({ phase: 'syncing' });
    unsubscribe();

    expect(isDriveSyncRuntimeMessage(received[0])).toBe(true);
    expect(received).toHaveLength(1);
    expect(sendMessage).toHaveBeenCalledWith({
      phase: 'syncing',
      type: DRIVE_SYNC_RUNTIME_MESSAGE_TYPE,
    });
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
