import {
  type ExtensionActionResult,
  type ExtensionCommandExecutionResult,
} from "@axon/extension-api";
import { readDisabledExtensionIds, writeDisabledExtensionIds } from "./enablement";
import { getExtensionMarketplaceState } from "./marketplace";
import { installExtensionPackage } from "./install";
import { getExtensionState } from "./state";
import { activateExtensionsForEvent } from "./activationStore";
import {
  activateRuntimeExtension,
  executeRuntimeCommand,
} from "./runtimeHost";

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

  async activate(
    event: string,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> {
    const state = this.getState(folderPath);
    const activated = activateExtensionsForEvent(state.extensions, event);
    const runtimeErrors: string[] = [];

    for (const record of activated) {
      const extension = state.extensions.find(
        (candidate) => candidate.id === record.extensionId,
      );
      if (!extension) continue;
      try {
        await activateRuntimeExtension(extension, folderPath);
      } catch (err) {
        runtimeErrors.push(
          `${extension.name}: ${
            err instanceof Error ? err.message : "activation failed"
          }`,
        );
      }
    }

    return {
      ok: runtimeErrors.length === 0,
      message:
        runtimeErrors.length > 0
          ? runtimeErrors.join("\n")
          : activated.length > 0
          ? `Activated ${activated.length} extension${activated.length === 1 ? "" : "s"} for ${event}.`
          : `No extensions activated for ${event}.`,
      state: this.getState(folderPath),
    };
  }

  async executeCommand(
    commandId: string,
    args: unknown[],
    folderPath?: string | null,
  ): Promise<ExtensionCommandExecutionResult> {
    try {
      const result = await executeRuntimeCommand(commandId, args);
      return {
        ok: true,
        message: `Executed ${commandId}.`,
        result,
        state: this.getState(folderPath),
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : `Failed to execute ${commandId}.`,
        state: this.getState(folderPath),
      };
    }
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
