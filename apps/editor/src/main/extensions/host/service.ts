/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  type ExtensionActionResult,
  type ExtensionCommandExecutionResult,
} from "@axon/extension-api";
import { readDisabledExtensionIds, writeDisabledExtensionIds } from "./state/enablement";
import { getExtensionMarketplaceState } from "./marketplace/marketplace";
import { installExtensionPackage } from "./marketplace/install";
import {
  getExtensionState,
  invalidateExtensionStateCache,
  refreshExtensionStateFromExistingState,
} from "./state/state";
import {
  activateExtensionsForEvent,
  clearExtensionActivationRecords,
  markExtensionActivationActive,
  markExtensionActivationFailed,
} from "./runtime/activationStore";
import {
  activateRuntimeExtension,
  deactivateRuntimeExtension,
  executeRuntimeCommand,
} from "./runtime/runtimeHost";
import fs from "fs";
import path from "path";
import { getUserExtensionsPath } from "../paths";

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

  async uninstall(
    extensionId: string,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> {
    const state = await this.getState(folderPath);
    const extension = state.extensions.find(
      (candidate) => candidate.id === extensionId,
    );

    if (!extension) {
      return {
        ok: false,
        message: `${extensionId} is not installed.`,
        state,
      };
    }

    if (extension.builtin || extension.source !== "user") {
      return {
        ok: false,
        message: `Only user-installed extensions can be removed.`,
        state,
      };
    }

    // Never delete anything outside the user extensions root, even if a
    // corrupted state record points a user extension id at another directory.
    const userExtensionsPath = getUserExtensionsPath();
    const relativePath = path.relative(userExtensionsPath, extension.path);
    if (
      relativePath === "" ||
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath)
    ) {
      return {
        ok: false,
        message: `Refusing to remove ${extensionId} outside the user extensions folder.`,
        state,
      };
    }

    clearExtensionActivationRecords(extensionId);
    await deactivateRuntimeExtension(extensionId);
    fs.rmSync(extension.path, { recursive: true, force: true });
    invalidateExtensionStateCache();

    return {
      ok: true,
      message: `Uninstalled ${extension.name}.`,
      state: await this.getState(folderPath),
    };
  }

  async reload(folderPath?: string | null): Promise<ExtensionActionResult> {
    invalidateExtensionStateCache();
    return {
      ok: true,
      message: "Reloaded extensions.",
      state: await this.getState(folderPath),
    };
  }

  async activate(
    event: string,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> {
    const state = await this.getState(folderPath);
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
      state: refreshExtensionStateFromExistingState(state, folderPath),
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
        state: refreshExtensionStateFromExistingState(
          activation.state,
          folderPath,
        ),
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : `Failed to execute ${commandId}.`,
        state: await this.getState(folderPath),
      };
    }
  }

  async setEnabled(
    extensionId: string,
    enabled: boolean,
    folderPath?: string | null,
  ): Promise<ExtensionActionResult> {
    const disabled = new Set(await readDisabledExtensionIds());
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
      state: await this.getState(folderPath),
    };
  }
}

export const extensionHostService = new ExtensionHostService();
