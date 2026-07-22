import { describe, expect, it, vi } from 'vitest';

import { createCoalescedRunner } from './coalescedRunner';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createCoalescedRunner', () => {
  it('keeps one active run and coalesces a burst into one trailing run', async () => {
    const firstRun = deferred();
    const secondRun = deferred();
    const task = vi.fn()
      .mockImplementationOnce(() => firstRun.promise)
      .mockImplementationOnce(() => secondRun.promise);
    const run = createCoalescedRunner(task);

    const result = run();
    expect(run()).toBe(result);
    expect(run()).toBe(result);
    expect(task).toHaveBeenCalledTimes(1);

    firstRun.resolve();
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2));
    secondRun.resolve();
    await result;

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('allows a fresh run after the previous cycle completes', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const run = createCoalescedRunner(task);

    await run();
    await run();

    expect(task).toHaveBeenCalledTimes(2);
  });
});
