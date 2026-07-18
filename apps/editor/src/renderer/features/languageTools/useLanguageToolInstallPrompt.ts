import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ManagedLanguageToolProgress,
  ManagedLanguageToolStatus,
} from "../../../shared/languageTools";
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
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionDismissalsRef = useRef(new Set<string>());

  useEffect(() => {
    return window.axon.onManagedLanguageToolProgress((event) => {
      setProgress((current) =>
        !status || event.id === status.id ? event : current,
      );
    });
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setProgress(null);
    setError(null);
    if (!activeFile || !folderPath || !workspaceTrusted) return;

    const languageId = detectLanguageServerLanguage(activeFile);
    void window.axon
      .getManagedLanguageToolRecommendation(languageId)
      .then((recommendation) => {
        if (cancelled || !recommendation) return;
        if (sessionDismissalsRef.current.has(recommendation.id)) return;
        if (isManagedLanguageToolPromptDisabled(recommendation.id)) return;
        setStatus(recommendation);
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
    setInstalling(true);
    setError(null);
    try {
      const result = await window.axon.installManagedLanguageTool(status.id);
      if (!result.ok) {
        if (result.message.endsWith("installation was cancelled.")) {
          setStatus(null);
          setProgress(null);
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
      setStatus(null);
      setProgress(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : String(caughtError),
      );
    } finally {
      setInstalling(false);
    }
  }, [folderPath, status]);

  const cancel = useCallback(async () => {
    if (!status) return;
    await window.axon.cancelManagedLanguageToolInstall(status.id);
  }, [status]);

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
