export function createLatestTaskQueue<T>(task: (input: T) => Promise<void>) {
  let activePromise: Promise<void> | null = null;
  let pendingInput: T;
  let hasPendingInput = false;

  const drain = async () => {
    while (hasPendingInput) {
      const input = pendingInput;
      hasPendingInput = false;
      await task(input);
    }
  };

  return {
    run(input: T) {
      // Watchers can request the same expensive operation many times while its
      // first process is still running. Retaining only the latest request avoids
      // parallel work but guarantees one trailing run observes disk state that
      // changed after the active snapshot began.
      pendingInput = input;
      hasPendingInput = true;
      activePromise ??= drain().finally(() => {
        activePromise = null;
      });
      return activePromise;
    },
  };
}
