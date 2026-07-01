import { type ExtensionActionResult } from "@axon/extension-api";
import { extensionHostService } from "./host/service";

export function getExtensionState(folderPath?: string | null) {
  return extensionHostService.getState(folderPath);
}

export function setExtensionEnabled(
  extensionId: string,
  enabled: boolean,
  folderPath?: string | null,
): ExtensionActionResult {
  return extensionHostService.setEnabled(extensionId, enabled, folderPath);
}
