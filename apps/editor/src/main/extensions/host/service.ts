import { type ExtensionActionResult } from "@axon/extension-api";
import { readDisabledExtensionIds, writeDisabledExtensionIds } from "./enablement";
import { getExtensionMarketplaceState } from "./marketplace";
import { installExtensionPackage } from "./install";
import { getExtensionState } from "./state";

export class ExtensionHostService {
  getState(folderPath?: string | null) {
    return getExtensionState(folderPath);
  }

  getMarketplaceState() {
    return getExtensionMarketplaceState();
  }

  install(extensionId: string, folderPath?: string | null) {
    return installExtensionPackage(extensionId, folderPath);
  }

  reload(folderPath?: string | null): ExtensionActionResult {
    return {
      ok: true,
      message: "Reloaded extensions.",
      state: this.getState(folderPath),
    };
  }

  setEnabled(
    extensionId: string,
    enabled: boolean,
    folderPath?: string | null,
  ): ExtensionActionResult {
    const disabled = new Set(readDisabledExtensionIds());
    if (enabled) {
      disabled.delete(extensionId);
    } else {
      disabled.add(extensionId);
    }

    writeDisabledExtensionIds(Array.from(disabled));
    return {
      ok: true,
      message: `${enabled ? "Enabled" : "Disabled"} ${extensionId}.`,
      state: this.getState(folderPath),
    };
  }
}

export const extensionHostService = new ExtensionHostService();
