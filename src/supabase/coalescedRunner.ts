export function createCoalescedRunner(task: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let rerunRequested = false;

  return function run() {
    if (running) {
      rerunRequested = true;
      return running;
    }

    // Collapse bursts into one active run plus at most one trailing run.
    running = (async () => {
      do {
        rerunRequested = false;
        await task();
      } while (rerunRequested);
    })().finally(() => {
      running = null;
    });

    return running;
  };
}
