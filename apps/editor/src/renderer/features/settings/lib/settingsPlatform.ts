import { type CustomFont } from "../../../../shared/settings";
import { type LanguageServerLifecycleResult, type LanguageServerStatus } from "../../../../shared/lsp";

export function importSettingsFont(): Promise<CustomFont | null> {
  return window.axon.importFont();
}

export function selectSettingsBackgroundImage(): Promise<string | null> {
  return window.axon.selectEditorBackgroundImage();
}

export function selectSettingsPythonVirtualEnv(folderPath: string | null) {
  return window.axon.selectPythonVirtualEnv(folderPath);
}

export function getSettingsLanguageServerStatus(
  folderPath: string,
): Promise<LanguageServerStatus[]> {
  return window.axon.getLanguageServerStatus(folderPath);
}

export function startSettingsLanguageServers(
  folderPath: string,
): Promise<LanguageServerLifecycleResult> {
  return window.axon.startLanguageServers(folderPath);
}

export function stopSettingsLanguageServers(
  folderPath: string,
): Promise<LanguageServerLifecycleResult> {
  return window.axon.stopLanguageServers(folderPath);
}
