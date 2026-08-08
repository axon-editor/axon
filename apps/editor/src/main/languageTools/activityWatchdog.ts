interface ActivityWatchdogOptions<T> {
  signal: AbortSignal;
  idleTimeoutMs: number;
  timeoutMessage: string;
  operation: (signal: AbortSignal, markActivity: () => void) => Promise<T>;
}

// runWithActivityWatchdog gives long-running local work a child abort signal
// that is cancelled by either the user's original signal or an idle timeout.
// The operation resets the timeout whenever bytes or entries move, so large
// archives can run as long as they remain active while a wedged stream cannot
// leave the installation registered forever.
export async function runWithActivityWatchdog<T>({
  signal,
  idleTimeoutMs,
  timeoutMessage,
  operation,
}: ActivityWatchdogOptions<T>) {
  signal.throwIfAborted();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let timeoutError: Error | null = null;

  const abortFromParent = () => controller.abort(signal.reason);
  const markActivity = () => {
    if (controller.signal.aborted) return;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeoutError = new Error(timeoutMessage);
      timeoutError.name = "TimeoutError";
      controller.abort(timeoutError);
    }, idleTimeoutMs);
    timeout.unref?.();
  };

  signal.addEventListener("abort", abortFromParent, { once: true });
  markActivity();
  try {
    return await operation(controller.signal, markActivity);
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    signal.removeEventListener("abort", abortFromParent);
    if (timeout) clearTimeout(timeout);
  }
}
