import { useCallback, useEffect, useRef } from "react";

export function useTrailingTask() {
  const timerRef = useRef<number | null>(null);

  const schedule = useCallback((task: () => void, delayMs: number) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      task();
    }, delayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return schedule;
}
