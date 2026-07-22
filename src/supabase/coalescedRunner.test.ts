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
  it('shares one active run across a burst without an unconditional trailing run', async () => {
    const activeRun = deferred();
    const task = vi.fn(() => activeRun.promise);
    const run = createCoalescedRunner(task);

    const result = run();
    expect(run()).toBe(result);
    expect(run()).toBe(result);
    expect(task).toHaveBeenCalledTimes(1);

    activeRun.resolve();
    await result;

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh run after the previous cycle completes', async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    const run = createCoalescedRunner(task);

    await run();
    await run();

    expect(task).toHaveBeenCalledTimes(2);
  });
});
