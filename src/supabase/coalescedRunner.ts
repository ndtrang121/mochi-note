export function createCoalescedRunner(task: () => Promise<void>) {
  let running: Promise<void> | null = null;

  return function run() {
    if (running) return running;

    // Requests received during an active run share that promise; the sync drain decides from outbox state whether more work exists.
    running = task().finally(() => {
      running = null;
    });

    return running;
  };
}
