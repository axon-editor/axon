import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { type GitStatusResult } from "../../../shared/git";
import { type OutputEntryLevel } from "../../../platform/panel/bottomPanel";

interface GitStatusRefreshOptions {
  appendOutput: (
    source: string,
    message: string,
    level?: OutputEntryLevel,
  ) => void;
  folderPath: string | null;
  setGitStatus: Dispatch<SetStateAction<GitStatusResult | null>>;
}

export function useGitStatusRefresh({
  appendOutput,
  folderPath,
  setGitStatus,
}: GitStatusRefreshOptions) {
  const requestIdRef = useRef(0);
  const inFlightFolderRef = useRef<string | null>(null);
  const activeFolderPathRef = useRef<string | null>(folderPath);
  const lastSlowRefreshOutputRef = useRef(0);
  activeFolderPathRef.current = folderPath;

  return useCallback(
    async (options?: { silent?: boolean }) => {
      if (!folderPath) {
        requestIdRef.current += 1;
        setGitStatus(null);
        return;
      }

      const requestedFolderPath = folderPath;
      if (inFlightFolderRef.current === requestedFolderPath) return;
      inFlightFolderRef.current = requestedFolderPath;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        const refreshStartedAt = performance.now();
        const nextStatus = await window.axon.getGitStatus(requestedFolderPath);
        const refreshDurationMs = Math.round(
          performance.now() - refreshStartedAt,
        );

        // Native file events, Git metadata events, saves, focus changes, and
        // the fallback heartbeat can request status close together. Only the
        // newest request for the still-active folder may update React state;
        // otherwise a slow old snapshot can overwrite a newer Git result.
        if (
          requestId !== requestIdRef.current ||
          activeFolderPathRef.current !== requestedFolderPath
        ) {
          return;
        }

        setGitStatus(nextStatus);
        if (
          refreshDurationMs > 1200 &&
          Date.now() - lastSlowRefreshOutputRef.current > 10_000
        ) {
          lastSlowRefreshOutputRef.current = Date.now();
          appendOutput(
            "git",
            `Git status refresh took ${refreshDurationMs}ms. Watcher updates may be catching up.`,
            "warning",
          );
        }
        if (!options?.silent) {
          appendOutput(
            "git",
            nextStatus.isRepository
              ? `Git status found ${nextStatus.changes.length} changed file${nextStatus.changes.length === 1 ? "" : "s"}.`
              : "Workspace is not a Git repository.",
            nextStatus.isRepository ? "success" : "warning",
          );
        }
      } catch (err) {
        if (
          requestId !== requestIdRef.current ||
          activeFolderPathRef.current !== requestedFolderPath
        ) {
          return;
        }
        console.error("failed to refresh git status:", err);
        appendOutput("git", "Failed to refresh Git status.", "error");
        setGitStatus(null);
      } finally {
        if (inFlightFolderRef.current === requestedFolderPath) {
          inFlightFolderRef.current = null;
        }
      }
    },
    [appendOutput, folderPath, setGitStatus],
  );
}
