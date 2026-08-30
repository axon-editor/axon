import { ipcMain } from "electron";
import fs from "fs";
import {
  getLanguageServerCodeActions,
  getLanguageServerCompletions,
  getLanguageServerDefinitions,
  executeLanguageServerCommand,
  getLanguageServerHover,
  resolveLanguageServerCompletionItem,
  getLanguageServerReferences,
  getLanguageServerSemanticTokens,
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
import { type WorkspaceCapabilityRegistry } from "../security/workspaceCapabilities";
import {
  type LanguageServerCodeActionRequest,
  type LanguageServerCodeActionResult,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResolveRequest,
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
  type LanguageServerSemanticTokensRequest,
  type LanguageServerSemanticTokensResult,
  type LanguageServerSignatureHelpRequest,
  type LanguageServerSignatureHelpResult,
  type LanguageServerStartForFileRequest,
} from "../../shared/lsp";

export function registerLspHandlers(
  workspaceCapabilities: WorkspaceCapabilityRegistry,
) {
  const authorizeRoot = (rendererId: number, folderPath: string) =>
    workspaceCapabilities.assertRoot(rendererId, folderPath);
  const authorizeDocumentRequest = <
    T extends { folderPath: string; filePath: string },
  >(
    rendererId: number,
    request: T,
  ): T => ({
    ...request,
    folderPath: authorizeRoot(rendererId, request.folderPath),
    filePath: workspaceCapabilities.assertReadablePath(
      rendererId,
      request.filePath,
    ),
  });
  const assertWritableEdits = (
    rendererId: number,
    edits: Record<string, unknown>,
  ) => {
    for (const filePath of Object.keys(edits)) {
      workspaceCapabilities.assertWritablePath(rendererId, filePath);
    }
  };

  ipcMain.handle("lsp:status", async (event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) return [];
    return getLanguageServerStatus(authorizeRoot(event.sender.id, folderPath));
  });

  ipcMain.handle(
    "lsp:workspaceStatus",
    async (event, folderPath: string, languageId: string) => {
      if (!folderPath || !fs.existsSync(folderPath)) return [];
      return getLanguageServerStatus(authorizeRoot(event.sender.id, folderPath), {
        relevantOnly: true,
        languageId,
      });
    },
  );

  ipcMain.handle("lsp:start", async (event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        ok: false,
        message: "Open a workspace before starting language servers.",
        servers: [],
      } satisfies LanguageServerLifecycleResult;
    }

    const authorizedFolder = authorizeRoot(event.sender.id, folderPath);
    const settings = await readSettingsForFolder(authorizedFolder);
    if (!settings.lsp.enabled) {
      return {
        ok: true,
        message: "Language servers are disabled in settings.",
        servers: await getLanguageServerStatus(authorizedFolder),
      } satisfies LanguageServerLifecycleResult;
    }

    return startRelevantLanguageServers(authorizedFolder);
  });

  ipcMain.handle(
    "lsp:startForLanguage",
    async (
      event,
      request: LanguageServerStartForFileRequest,
    ): Promise<LanguageServerLifecycleResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return {
          ok: false,
          message: "Open a workspace before starting language servers.",
          servers: [],
        };
      }

      const authorizedFolder = authorizeRoot(
        event.sender.id,
        request.folderPath,
      );
      const settings = await readSettingsForFolder(authorizedFolder);
      if (!settings.lsp.enabled) {
        return {
          ok: true,
          message: "Language servers are disabled in settings.",
          servers: await getLanguageServerStatus(authorizedFolder),
        };
      }

      return startLanguageServerForLanguage(
        authorizedFolder,
        request.languageId,
      );
    },
  );

  ipcMain.handle("lsp:stop", async (event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) {
      return {
        ok: false,
        message: "Open a workspace before stopping language servers.",
        servers: [],
      } satisfies LanguageServerLifecycleResult;
    }

    return stopRelevantLanguageServers(
      authorizeRoot(event.sender.id, folderPath),
    );
  });

  ipcMain.handle(
    "lsp:completion",
    async (
      event,
      request: LanguageServerCompletionRequest,
    ): Promise<LanguageServerCompletionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, items: [] };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) {
        return { ok: true, items: [] };
      }

      return getLanguageServerCompletions(authorizedRequest);
    },
  );

  ipcMain.handle(
    "lsp:syncDocument",
    async (event, request: LanguageServerDocumentSyncRequest): Promise<void> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) return;

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return;

      await syncDocumentWithLanguageServer(authorizedRequest);
    },
  );

  ipcMain.handle(
    "lsp:resolveCompletion",
    async (
      event,
      request: LanguageServerCompletionResolveRequest,
    ): Promise<LanguageServerCompletionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, items: [request.item] };
      }
      return resolveLanguageServerCompletionItem({
        ...request,
        folderPath: authorizeRoot(event.sender.id, request.folderPath),
      });
    },
  );

  ipcMain.handle(
    "lsp:hover",
    async (
      event,
      request: LanguageServerHoverRequest,
    ): Promise<LanguageServerHoverResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, contents: [] };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, contents: [] };

      return getLanguageServerHover(authorizedRequest);
    },
  );

  ipcMain.handle(
    "lsp:definition",
    async (
      event,
      request: LanguageServerDefinitionRequest,
    ): Promise<LanguageServerDefinitionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, locations: [] };
      }
      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, locations: [] };

      const result = await getLanguageServerDefinitions(authorizedRequest);
      if (result.ok) {
        for (const location of result.locations) {
          workspaceCapabilities.authorizeReadOnlyFile(
            event.sender.id,
            location.filePath,
          );
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    "lsp:references",
    async (
      event,
      request: LanguageServerReferencesRequest,
    ): Promise<LanguageServerReferencesResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, locations: [] };
      }
      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, locations: [] };

      const result = await getLanguageServerReferences(authorizedRequest);
      if (result.ok) {
        for (const location of result.locations) {
          workspaceCapabilities.authorizeReadOnlyFile(
            event.sender.id,
            location.filePath,
          );
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    "lsp:rename",
    async (
      event,
      request: LanguageServerRenameRequest,
    ): Promise<LanguageServerRenameResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, edits: {} };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, edits: {} };

      const result = await renameLanguageServerSymbol(authorizedRequest);
      if (result.ok) assertWritableEdits(event.sender.id, result.edits);
      return result;
    },
  );

  ipcMain.handle(
    "lsp:format",
    async (
      event,
      request: LanguageServerFormatRequest,
    ): Promise<LanguageServerFormatResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, edits: [] };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, edits: [] };

      return formatLanguageServerDocument(authorizedRequest);
    },
  );

  ipcMain.handle(
    "lsp:signatureHelp",
    async (
      event,
      request: LanguageServerSignatureHelpRequest,
    ): Promise<LanguageServerSignatureHelpResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, signatures: [] };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, signatures: [] };

      return getLanguageServerSignatureHelp(authorizedRequest);
    },
  );

  ipcMain.handle(
    "lsp:semanticTokens",
    async (
      event,
      request: LanguageServerSemanticTokensRequest,
    ): Promise<LanguageServerSemanticTokensResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return {
          ok: true,
          legend: { tokenTypes: [], tokenModifiers: [] },
          data: [],
        };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) {
        return {
          ok: true,
          legend: { tokenTypes: [], tokenModifiers: [] },
          data: [],
        };
      }

      return getLanguageServerSemanticTokens(authorizedRequest);
    },
  );

  ipcMain.handle(
    "lsp:codeActions",
    async (
      event,
      request: LanguageServerCodeActionRequest,
    ): Promise<LanguageServerCodeActionResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, actions: [] };
      }

      const authorizedRequest = authorizeDocumentRequest(
        event.sender.id,
        request,
      );
      const settings = await readSettingsForFolder(
        authorizedRequest.folderPath,
      );
      if (!settings.lsp.enabled) return { ok: true, actions: [] };

      const result = await getLanguageServerCodeActions(authorizedRequest);
      if (result.ok) {
        for (const action of result.actions) {
          assertWritableEdits(event.sender.id, action.edits);
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    "lsp:executeCommand",
    async (
      event,
      request: LanguageServerExecuteCommandRequest,
    ): Promise<LanguageServerExecuteCommandResult> => {
      if (!request.folderPath || !fs.existsSync(request.folderPath)) {
        return { ok: true, edits: {} };
      }

      const authorizedFolder = authorizeRoot(
        event.sender.id,
        request.folderPath,
      );
      const settings = await readSettingsForFolder(authorizedFolder);
      if (!settings.lsp.enabled) return { ok: true, edits: {} };

      const result = await executeLanguageServerCommand({
        ...request,
        folderPath: authorizedFolder,
      });
      if (result.ok) assertWritableEdits(event.sender.id, result.edits);
      return result;
    },
  );
}
