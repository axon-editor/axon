export interface SingleFlight<Key, Value> {
  run(key: Key, operation: () => Promise<Value> | Value): Promise<Value>;
}

export function createSingleFlight<Key, Value>(): SingleFlight<Key, Value> {
  const pending = new Map<Key, Promise<Value>>();

  return {
    run(key, operation) {
      const existing = pending.get(key);
      if (existing) return existing;

      // The promise is stored before operation runs on the next microtask. That
      // ordering closes the small but important window where two independent
      // callers can both pass a process-existence check and launch duplicate
      // work. Success and failure both remove only their own promise, allowing
      // a later explicit retry without an older completion deleting it.
      const promise = Promise.resolve().then(operation);
      pending.set(key, promise);
      const clear = () => {
        if (pending.get(key) === promise) pending.delete(key);
      };
      void promise.then(clear, clear);
      return promise;
    },
  };
}
