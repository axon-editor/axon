import { useCallback, useEffect, useRef, useState } from "react";
import {
  isManagedLanguageToolProgressActive,
  type ManagedLanguageToolId,
  type ManagedLanguageToolProgress,
} from "../../../shared/languageTools";

const TERMINAL_PROGRESS_LIFETIME_MS = 5000;

export function useManagedLanguageToolInstallations() {
  const [progressById, setProgressById] = useState(
    () => new Map<ManagedLanguageToolId, ManagedLanguageToolProgress>(),
  );
  const removalTimers = useRef(
    new Map<ManagedLanguageToolId, ReturnType<typeof setTimeout>>(),
  );

  const dismiss = useCallback((id: ManagedLanguageToolId) => {
    const timer = removalTimers.current.get(id);
    if (timer) clearTimeout(timer);
    removalTimers.current.delete(id);
    setProgressById((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const timers = removalTimers.current;
    const receive = (progress: ManagedLanguageToolProgress) => {
      if (disposed) return;
      const timer = timers.get(progress.id);
      if (timer) clearTimeout(timer);
      timers.delete(progress.id);
      setProgressById((current) => new Map(current).set(progress.id, progress));
      if (!isManagedLanguageToolProgressActive(progress)) {
        timers.set(
          progress.id,
          setTimeout(() => dismiss(progress.id), TERMINAL_PROGRESS_LIFETIME_MS),
        );
      }
    };
    const unsubscribe = window.axon.onManagedLanguageToolProgress(receive);
    void window.axon
      .listManagedLanguageToolInstallProgress()
      .then((activeProgress) => {
        if (disposed) return;
        setProgressById((current) => {
          const next = new Map(current);
          for (const progress of activeProgress) {
            if (isManagedLanguageToolProgressActive(progress)) {
              next.set(progress.id, progress);
            }
          }
          return next;
        });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unsubscribe();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [dismiss]);

  const cancel = useCallback(
    async (id: ManagedLanguageToolId) => {
      const cancelled = await window.axon.cancelManagedLanguageToolInstall(id);
      if (!cancelled) dismiss(id);
      return cancelled;
    },
    [dismiss],
  );

  return {
    progress: Array.from(progressById.values()),
    cancel,
    dismiss,
  };
}

export type ManagedLanguageToolInstallations = ReturnType<
  typeof useManagedLanguageToolInstallations
>;
