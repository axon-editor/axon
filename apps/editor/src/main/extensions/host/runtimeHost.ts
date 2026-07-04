import { app } from "electron";
import fs from "fs";
import path from "path";
import {
  type AxonExtensionApi,
  type AxonExtensionModule,
  type Disposable,
  type ExtensionInfo,
} from "@axon/extension-api";
import { resolveExtensionPath } from "../paths";

interface RuntimeCommandRegistration {
  extensionId: string;
  commandId: string;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
}

interface RuntimeExtensionRecord {
  extensionId: string;
  activated: boolean;
  activatedAt: string | null;
  commands: string[];
  views: string[];
  terminalProfiles: string[];
  errors: string[];
  subscriptions: Disposable[];
  module?: AxonExtensionModule;
}

const runtimeRecords = new Map<string, RuntimeExtensionRecord>();
const commandHandlers = new Map<string, RuntimeCommandRegistration>();

function getRuntimeRecord(extensionId: string) {
  const existing = runtimeRecords.get(extensionId);
  if (existing) return existing;

  const record: RuntimeExtensionRecord = {
    extensionId,
    activated: false,
    activatedAt: null,
    commands: [],
    views: [],
    terminalProfiles: [],
    errors: [],
    subscriptions: [],
  };
  runtimeRecords.set(extensionId, record);
  return record;
}

function createDisposable(onDispose: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      onDispose();
    },
  };
}

function createRuntimeStoragePath(extension: ExtensionInfo, folderPath?: string | null) {
  const safeExtensionId = extension.id.replace(/[^a-z0-9._-]/gi, "-");
  const globalStoragePath = path.join(
    app.getPath("userData"),
    "extension-storage",
    safeExtensionId,
  );
  const workspaceStoragePath = folderPath
    ? path.join(folderPath, ".axon", "extension-storage", safeExtensionId)
    : null;

  fs.mkdirSync(globalStoragePath, { recursive: true });
  if (workspaceStoragePath) {
    fs.mkdirSync(workspaceStoragePath, { recursive: true });
  }

  return { globalStoragePath, workspaceStoragePath };
}

function createExtensionApi(record: RuntimeExtensionRecord): AxonExtensionApi {
  return {
    commands: {
      registerCommand(commandId, handler) {
        if (typeof commandId !== "string" || commandId.trim() === "") {
          throw new Error("Command id is required.");
        }
        if (typeof handler !== "function") {
          throw new Error(`Command "${commandId}" must register a function.`);
        }

        commandHandlers.set(commandId, {
          extensionId: record.extensionId,
          commandId,
          handler,
        });
        if (!record.commands.includes(commandId)) {
          record.commands.push(commandId);
        }

        // Runtime command handlers live in the main process registry because
        // renderer code should never import arbitrary extension packages. The
        // disposable removes the handler from that registry when an extension is
        // deactivated later, preventing stale commands from surviving reloads
        // or enablement changes.
        return createDisposable(() => {
          const current = commandHandlers.get(commandId);
          if (current?.extensionId === record.extensionId) {
            commandHandlers.delete(commandId);
          }
          record.commands = record.commands.filter((id) => id !== commandId);
        });
      },
      async executeCommand<T = unknown>(commandId: string, ...args: unknown[]) {
        return executeRuntimeCommand(commandId, args) as Promise<T>;
      },
    },
    views: {
      registerSidebarView(viewId) {
        if (!record.views.includes(viewId)) record.views.push(viewId);
        return createDisposable(() => {
          record.views = record.views.filter((id) => id !== viewId);
        });
      },
      registerPanelView(viewId) {
        if (!record.views.includes(viewId)) record.views.push(viewId);
        return createDisposable(() => {
          record.views = record.views.filter((id) => id !== viewId);
        });
      },
    },
    terminals: {
      registerTerminalProfile(profileId) {
        if (!record.terminalProfiles.includes(profileId)) {
          record.terminalProfiles.push(profileId);
        }
        return createDisposable(() => {
          record.terminalProfiles = record.terminalProfiles.filter(
            (id) => id !== profileId,
          );
        });
      },
    },
  };
}

function readExtensionModule(mainPath: string): AxonExtensionModule {
  // The first runtime host is intentionally in-process and CommonJS-based
  // because Axon's Electron main build is CommonJS today. This is not the final
  // sandbox, but it gives extension authors a real activate(context, api) path
  // now while keeping the future isolated-process boundary behind the same API.
  const loadedModule = require(mainPath) as AxonExtensionModule & {
    default?: AxonExtensionModule;
  };
  return loadedModule.default ?? loadedModule;
}

export function getRuntimeExtensionRecord(extensionId: string) {
  return runtimeRecords.get(extensionId) ?? null;
}

export async function activateRuntimeExtension(
  extension: ExtensionInfo,
  folderPath?: string | null,
) {
  if (extension.hostKind !== "isolated-process") return;
  const record = getRuntimeRecord(extension.id);
  if (record.activated) return;

  try {
    if (!extension.main) {
      throw new Error("Executable extension is missing a main entry.");
    }

    const mainPath = resolveExtensionPath(extension.path, extension.main);
    if (!fs.existsSync(mainPath)) {
      throw new Error(`Extension main file was not found: ${extension.main}`);
    }

    const { globalStoragePath, workspaceStoragePath } = createRuntimeStoragePath(
      extension,
      folderPath,
    );
    const context = {
      extensionId: extension.id,
      extensionPath: extension.path,
      globalStoragePath,
      workspaceStoragePath,
      subscriptions: record.subscriptions,
    };
    const extensionModule = readExtensionModule(mainPath);
    record.module = extensionModule;

    const api = createExtensionApi(record);
    const activated = await extensionModule.activate?.(context, api);
    if (activated && typeof activated.dispose === "function") {
      record.subscriptions.push(activated);
    }

    record.activated = true;
    record.activatedAt = new Date().toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extension activation failed.";
    record.errors = [...record.errors, message];
    throw new Error(message);
  }
}

export async function deactivateRuntimeExtension(extensionId: string) {
  const record = runtimeRecords.get(extensionId);
  if (!record) return;

  const errors: string[] = [];
  try {
    await record.module?.deactivate?.();
  } catch (err) {
    errors.push(
      err instanceof Error ? err.message : "Extension deactivation failed.",
    );
  }

  for (const disposable of [...record.subscriptions]) {
    try {
      disposable.dispose();
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : "Extension disposable failed.",
      );
    }
  }

  for (const [commandId, registration] of commandHandlers) {
    if (registration.extensionId === extensionId) {
      commandHandlers.delete(commandId);
    }
  }

  runtimeRecords.set(extensionId, {
    extensionId,
    activated: false,
    activatedAt: null,
    commands: [],
    views: [],
    terminalProfiles: [],
    errors: [...record.errors, ...errors],
    subscriptions: [],
  });
}

export async function executeRuntimeCommand(
  commandId: string,
  args: unknown[] = [],
) {
  const registration = commandHandlers.get(commandId);
  if (!registration) {
    throw new Error(`No runtime command is registered for "${commandId}".`);
  }

  return registration.handler(...args);
}

export function getRuntimeDiagnostics(extension: ExtensionInfo) {
  const record = runtimeRecords.get(extension.id);
  if (!record) {
    return {
      activated: false,
      activatedAt: null,
      commands: [] as string[],
      views: [] as string[],
      terminalProfiles: [] as string[],
      errors: [] as string[],
    };
  }

  return {
    activated: record.activated,
    activatedAt: record.activatedAt,
    commands: [...record.commands],
    views: [...record.views],
    terminalProfiles: [...record.terminalProfiles],
    errors: [...record.errors],
  };
}
