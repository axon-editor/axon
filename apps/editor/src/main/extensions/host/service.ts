import {
  type ExtensionActionResult,
  type ExtensionCommandExecutionResult,
} from "@axon/extension-api";
import { readDisabledExtensionIds, writeDisabledExtensionIds } from "./enablement";
import { getExtensionMarketplaceState } from "./marketplace";
import { installExtensionPackage } from "./install";
import { getExtensionState, invalidateExtensionStateCache } from "./state";
import {
  activateExtensionsForEvent,
  clearExtensionActivationRecords,
  markExtensionActivationActive,
  markExtensionActivationFailed,
} from "./activationStore";
import {
  activateRuntimeExtension,
  deactivateRuntimeExtension,
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
    invalidateExtensionStateCache();
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
        markExtensionActivationActive(extension.id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "activation failed";
        markExtensionActivationFailed(extension.id, message);
        runtimeErrors.push(`${extension.name}: ${message}`);
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
      const activation = await this.activate(
        `onCommand:${commandId}`,
        folderPath,
      );
      if (!activation.ok) {
        return {
          ok: false,
          message: activation.message,
          state: activation.state,
        };
      }

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

  async setEnabled(
    extensionId: string,
    enabled: boolean,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> {
    const disabled = new Set(readDisabledExtensionIds());
    if (enabled) {
      disabled.delete(extensionId);
    } else {
      disabled.add(extensionId);
      clearExtensionActivationRecords(extensionId);
      await deactivateRuntimeExtension(extensionId);
    }

    writeDisabledExtensionIds(Array.from(disabled));
    invalidateExtensionStateCache();
    return {
      ok: true,
      message: `${enabled ? "Enabled" : "Disabled"} ${extensionId}.`,
      state: this.getState(folderPath),
    };
  }
}

export const extensionHostService = new ExtensionHostService();
