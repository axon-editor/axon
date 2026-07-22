import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ManagedLanguageToolProgress,
  ManagedLanguageToolStatus,
} from "../../../shared/languageTools";
import { isManagedLanguageToolProgressActive } from "../../../shared/languageTools";
import { detectLanguageServerLanguage } from "../editor/lib/monacoModels";
import {
  disableManagedLanguageToolPrompt,
  enableManagedLanguageToolPrompt,
  isManagedLanguageToolPromptDisabled,
} from "./languageToolPreferences";

interface UseLanguageToolInstallPromptOptions {
  activeFile: string | null;
  folderPath: string | null;
  workspaceTrusted: boolean;
}

export function useLanguageToolInstallPrompt({
  activeFile,
  folderPath,
  workspaceTrusted,
}: UseLanguageToolInstallPromptOptions) {
  const [status, setStatus] = useState<ManagedLanguageToolStatus | null>(null);
  const [progress, setProgress] = useState<ManagedLanguageToolProgress | null>(
    null,
  );
  const [installingToolId, setInstallingToolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionDismissalsRef = useRef(new Set<string>());

  useEffect(() => {
    return window.axon.onManagedLanguageToolProgress((event) => {
      if (!status || event.id !== status.id) return;
      setProgress(event);
      setInstallingToolId((current) =>
        isManagedLanguageToolProgressActive(event)
          ? event.id
          : current === event.id
            ? null
            : current,
      );
    });
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setProgress(null);
    setInstallingToolId(null);
    setError(null);
    if (!activeFile || !folderPath || !workspaceTrusted) return;

    const languageId = detectLanguageServerLanguage(activeFile);
    void window.axon
      .getManagedLanguageToolRecommendation(languageId)
      .then(async (recommendation) => {
        if (cancelled || !recommendation) return;
        if (sessionDismissalsRef.current.has(recommendation.id)) return;
        if (isManagedLanguageToolPromptDisabled(recommendation.id)) return;
        const activeProgress =
          await window.axon.getManagedLanguageToolInstallProgress(
            recommendation.id,
          );
        if (cancelled) return;
        setStatus(recommendation);
        setProgress(activeProgress);
        setInstallingToolId(
          isManagedLanguageToolProgressActive(activeProgress)
            ? recommendation.id
            : null,
        );
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : String(caughtError),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFile, folderPath, workspaceTrusted]);

  const dismiss = useCallback(() => {
    if (status) sessionDismissalsRef.current.add(status.id);
    setStatus(null);
    setProgress(null);
    setError(null);
  }, [status]);

  const neverAsk = useCallback(() => {
    if (status) {
      disableManagedLanguageToolPrompt(status.id);
    }
    dismiss();
  }, [dismiss, status]);

  const install = useCallback(async () => {
    if (!status || !folderPath) return;
    const toolId = status.id;
    setInstallingToolId(toolId);
    setError(null);
    try {
      const result = await window.axon.installManagedLanguageTool(status.id);
      if (!result.ok) {
        if (result.message.endsWith("installation was cancelled.")) {
          setStatus((current) => (current?.id === toolId ? null : current));
          setProgress((current) => (current?.id === toolId ? null : current));
          return;
        }
        setError(result.message);
        return;
      }
      enableManagedLanguageToolPrompt(status.id);
      const languageId = status.languages[0];
      await window.axon.startLanguageServerForLanguage({
        folderPath,
        languageId,
      });
      setStatus((current) => (current?.id === toolId ? null : current));
      setProgress((current) => (current?.id === toolId ? null : current));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      );
    } finally {
      setInstallingToolId((current) => (current === toolId ? null : current));
    }
  }, [folderPath, status]);

  const cancel = useCallback(async () => {
    if (!status) return;
    const cancelled = await window.axon.cancelManagedLanguageToolInstall(
      status.id,
    );
    if (!cancelled) {
      setInstallingToolId(null);
      setError("The language tool installation is no longer running.");
    }
  }, [status]);

  const installing = Boolean(status && installingToolId === status.id);

  return {
    open: Boolean(status),
    status,
    progress,
    installing,
    error,
    install,
    cancel,
    dismiss,
    neverAsk,
  };
}
