import { useCallback, useEffect, useState } from "react";
import { type CliToolStatus } from "../../../shared/app";

const dismissedStorageKey = "axon.cliToolInstallPrompt.dismissed";

interface CliToolInstallPromptState {
  open: boolean;
  status: CliToolStatus | null;
  installing: boolean;
  error: string | null;
  install: () => Promise<void>;
  dismiss: () => void;
}

export function useCliToolInstallPrompt(): CliToolInstallPromptState {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CliToolStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkCliTool() {
      if (!["darwin", "linux"].includes(window.axon.platform)) return;
      if (window.localStorage.getItem(dismissedStorageKey) === "true") return;

      try {
        const nextStatus = await window.axon.getCliToolStatus();
        if (cancelled) return;
        setStatus(nextStatus);

        // The terminal command only helps if the released CLI binary is present
        // and reachable from PATH. Showing the prompt from renderer state keeps
        // the main process as the authority for filesystem checks while giving
        // the user a clear install action instead of a silent command-not-found.
        if (
          nextStatus.supported &&
          nextStatus.sourceAvailable &&
          (!nextStatus.installed || nextStatus.needsUpdate)
        ) {
          setOpen(true);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError),
          );
        }
      }
    }

    void checkCliTool();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(dismissedStorageKey, "true");
    setOpen(false);
  }, []);

  const install = useCallback(async () => {
    setInstalling(true);
    setError(null);
    try {
      const result = await window.axon.installCliTool();
      setStatus(result.status);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      window.localStorage.removeItem(dismissedStorageKey);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : String(caughtError),
      );
    } finally {
      setInstalling(false);
    }
  }, []);

  return { open, status, installing, error, install, dismiss };
}
