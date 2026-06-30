import { ipcMain } from "electron";
import fs from "fs";
import {
  getLanguageServerCodeActions,
  getLanguageServerCompletions,
  getLanguageServerDefinitions,
  executeLanguageServerCommand,
  getLanguageServerHover,
  getLanguageServerReferences,
  formatLanguageServerDocument,
  getLanguageServerSignatureHelp,
  getLanguageServerStatus,
  renameLanguageServerSymbol,
  startLanguageServerForLanguage,
  startRelevantLanguageServers,
  stopRelevantLanguageServers,
  syncDocumentWithLanguageServer,
} from "./features";
import { readSettingsForFolder } from "../settings/io";
import {
  type LanguageServerCodeActionRequest,
  type LanguageServerCodeActionResult,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerDefinitionRequest,
  type LanguageServerDefinitionResult,
  type LanguageServerDocumentSyncRequest,
  type LanguageServerExecuteCommandRequest,
  type LanguageServerExecuteCommandResult,
  type LanguageServerFormatRequest,
  type LanguageServerFormatResult,
  type LanguageServerHoverRequest,
  type LanguageServerHoverResult,
  type LanguageServerLifecycleResult,
  type LanguageServerReferencesRequest,
  type LanguageServerReferencesResult,
  type LanguageServerRenameRequest,
  type LanguageServerRenameResult,
  type LanguageServerSignatureHelpRequest,
  type LanguageServerSignatureHelpResult,
  type LanguageServerStartForFileRequest,
  type LanguageServerStatus,
} from "../../shared/lsp";

export function registerLspHandlers() {
  ipcMain.handle("lsp:status", async (_event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) return [];
    return getLanguageServerStatus(folderPath);
  });

  ipcMain.handle("lsp:start", async (_event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        ok: false,
        message: "Open a workspace before starting language servers.",
        servers: [],
      } satisfies LanguageServerLifecycleResult;
    }

    return startRelevantLanguageServers(folderPath);
  });

  ipcMain.handle(
    "lsp:startForLanguage",
    async (
      _event,
      request: LanguageServerStartForFileRequest,
    ): Promise<LanguageServerLifecycleResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return {
          ok: false,
          message: "Open a workspace before starting language servers.",
          servers: [],
        };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) {
        return {
          ok: true,
          message: "Language servers are disabled in settings.",
          servers: await getLanguageServerStatus(request.folderPath),
        };
      }

      return startLanguageServerForLanguage(
        request.folderPath,
        request.languageId,
      );
    },
  );

  ipcMain.handle("lsp:stop", async (_event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        ok: false,
        message: "Open a workspace before stopping language servers.",
        servers: [],
      } satisfies LanguageServerLifecycleResult;
    }

    return stopRelevantLanguageServers(folderPath);
  });

  ipcMain.handle(
    "lsp:completion",
    async (
      _event,
      request: LanguageServerCompletionRequest,
    ): Promise<LanguageServerCompletionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, items: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) {
        return { ok: true, items: [] };
      }

      return getLanguageServerCompletions(request);
    },
  );

  ipcMain.handle(
    "lsp:syncDocument",
    async (_event, request: LanguageServerDocumentSyncRequest): Promise<void> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) return;

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return;

      await syncDocumentWithLanguageServer(request);
    },
  );

  ipcMain.handle(
    "lsp:hover",
    async (
      _event,
      request: LanguageServerHoverRequest,
    ): Promise<LanguageServerHoverResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, contents: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, contents: [] };

      return getLanguageServerHover(request);
    },
  );

  ipcMain.handle(
    "lsp:definition",
    async (
      _event,
      request: LanguageServerDefinitionRequest,
    ): Promise<LanguageServerDefinitionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, locations: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, locations: [] };

      return getLanguageServerDefinitions(request);
    },
  );

  ipcMain.handle(
    "lsp:references",
    async (
      _event,
      request: LanguageServerReferencesRequest,
    ): Promise<LanguageServerReferencesResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, locations: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, locations: [] };

      return getLanguageServerReferences(request);
    },
  );

  ipcMain.handle(
    "lsp:rename",
    async (
      _event,
      request: LanguageServerRenameRequest,
    ): Promise<LanguageServerRenameResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, edits: {} };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, edits: {} };

      return renameLanguageServerSymbol(request);
    },
  );

  ipcMain.handle(
    "lsp:format",
    async (
      _event,
      request: LanguageServerFormatRequest,
    ): Promise<LanguageServerFormatResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, edits: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, edits: [] };

      return formatLanguageServerDocument(request);
    },
  );

  ipcMain.handle(
    "lsp:signatureHelp",
    async (
      _event,
      request: LanguageServerSignatureHelpRequest,
    ): Promise<LanguageServerSignatureHelpResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, signatures: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, signatures: [] };

      return getLanguageServerSignatureHelp(request);
    },
  );

  ipcMain.handle(
    "lsp:codeActions",
    async (
      _event,
      request: LanguageServerCodeActionRequest,
    ): Promise<LanguageServerCodeActionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, actions: [] };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, actions: [] };

      return getLanguageServerCodeActions(request);
    },
  );

  ipcMain.handle(
    "lsp:executeCommand",
    async (
      _event,
      request: LanguageServerExecuteCommandRequest,
    ): Promise<LanguageServerExecuteCommandResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, edits: {} };
      }

      const settings = await readSettingsForFolder(request.folderPath);
      if (!settings.lsp.enabled) return { ok: true, edits: {} };

      return executeLanguageServerCommand(request);
    },
  );
}
