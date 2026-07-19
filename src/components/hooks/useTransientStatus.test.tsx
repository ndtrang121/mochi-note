import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTransientStatus } from './useTransientStatus';

describe('useTransientStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears a status five seconds after its latest update', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientStatus());

    act(() => result.current[1]('Đã lưu'));
    await act(() => vi.advanceTimersByTime(4_999));
    expect(result.current[0]).toBe('Đã lưu');

    await act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBeNull();
  });

  it('restarts the timeout when a newer status replaces the current one', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTransientStatus());

    act(() => result.current[1]('Đã lưu'));
    await act(() => vi.advanceTimersByTime(4_000));
    act(() => result.current[1]('Đã lưu'));
    await act(() => vi.advanceTimersByTime(1_001));
    expect(result.current[0]).toBe('Đã lưu');

    await act(() => vi.advanceTimersByTime(3_999));
    expect(result.current[0]).toBeNull();
  });
});
