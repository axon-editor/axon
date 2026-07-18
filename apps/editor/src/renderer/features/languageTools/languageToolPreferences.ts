import type { ManagedLanguageToolId } from "../../../shared/languageTools";

const DISMISSED_STORAGE_PREFIX = "axon.languageTools.dismissed.";

export function isManagedLanguageToolPromptDisabled(
  id: ManagedLanguageToolId,
) {
  return (
    window.localStorage.getItem(`${DISMISSED_STORAGE_PREFIX}${id}`) === "true"
  );
}

export function disableManagedLanguageToolPrompt(id: ManagedLanguageToolId) {
  window.localStorage.setItem(`${DISMISSED_STORAGE_PREFIX}${id}`, "true");
}

export function enableManagedLanguageToolPrompt(id: ManagedLanguageToolId) {
  window.localStorage.removeItem(`${DISMISSED_STORAGE_PREFIX}${id}`);
}
