import fs from "fs";
import path from "path";
import url from "url";
import { app, BrowserWindow } from "electron";
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "child_process";
import { type EditorDiagnostic } from "../../shared/diagnostics";
import {
  type LanguageServerCodeAction,
  type LanguageServerCodeActionRequest,
  type LanguageServerCodeActionResult,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerCommand,
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
  type LanguageServerSignature,
  type LanguageServerSignatureHelpRequest,
  type LanguageServerSignatureHelpResult,
  type LanguageServerStartForFileRequest,
  type LanguageServerStatus,
  type LanguageServerTextEdit,
  type LanguageServerLocation,
} from "../../shared/lsp";
import { normalizeLanguageServerCompletionItems } from "./completionItems";
import {
  LANGUAGE_SERVER_DEFINITIONS,
  type LanguageServerDefinition,
  type LanguageServerStartAttempt,
  type ResolvedLanguageServerCommand,
} from "./definitions";
import { formatWithBundledPrettier } from "./formatting";
import {
  emitLanguageServerLog,
  getLanguageServerInitializationOptions,
  getLanguageServerSessionKey,
  getPythonLanguageServerSettings,
  getTypeScriptLanguageServerPreferences,
  hasWorkspaceMarker,
  notifyLanguageServerConfiguration,
  resolveLanguageServerCommand,
  resolveCommandPath,
  type LanguageServerSession,
  type LspSessionDependencies,
  canRunCommand,
  writeLanguageServerMessage,
  rejectLanguageServerPendingRequests,
  waitForLanguageServerSpawn,
  readLanguageServerMessages,
} from "./session";

export const activeLanguageServers = new Map<string, LanguageServerSession>();
export const activeLanguageServerFailures = new Map<
  string,
  { message: string; timestamp: number }
>();
const diagnosticsDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingDiagnosticsByFile = new Map<
  string,
  {
    folderPath: string;
    filePath: string;
    serverId: string;
    diagnostics: EditorDiagnostic[];
  }
>();
export const stoppingLanguageServerKeys = new Set<string>();
export const warmingLanguageServerKeys = new Set<string>();
export const LANGUAGE_SERVER_INITIALIZE_TIMEOUT_MS = 120_000;
export const LANGUAGE_SERVER_INITIALIZE_RETRY_DELAY_MS = 2_000;
export const LANGUAGE_SERVER_INITIALIZE_MAX_RETRIES = 2;
export const LANGUAGE_SERVER_COMPLETION_WARMUP_WAIT_MS = 8_000;
export const LANGUAGE_SERVER_COMPLETION_WARMUP_POLL_MS = 80;
let loginShellEnvironmentPromise: Promise<NodeJS.ProcessEnv> | null = null;

const lspWatchedFileChangeTypes = {
  create: 1,
  change: 2,
  delete: 3,
} as const;

function diagnosticsPendingKey(input: {
  folderPath: string;
  serverId: string;
  filePath: string;
}) {
  return `${input.folderPath}::${input.serverId}::${input.filePath}`;
}

export function clearPendingDiagnosticsForSession(session: LanguageServerSession) {
  const prefix = `${session.folderPath}::${session.id}::`;
  for (const [key, timer] of diagnosticsDebounceTimers) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(timer);
    diagnosticsDebounceTimers.delete(key);
    pendingDiagnosticsByFile.delete(key);
  }
}

function isPathInsideWorkspace(filePath: string, folderPath: string) {
  const normalizedFile = path.resolve(filePath);
  const normalizedFolder = path.resolve(folderPath);
  const relativePath = path.relative(normalizedFolder, normalizedFile);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function notifyLanguageServersOfFileChange(
  folderPath: string,
  filePath: string,
  changeType: keyof typeof lspWatchedFileChangeTypes,
) {
  if (!isPathInsideWorkspace(filePath, folderPath)) return;

  const uri = url.pathToFileURL(filePath).toString();
  for (const session of activeLanguageServers.values()) {
    if (session.folderPath !== folderPath) continue;
    if (!session.initialized || session.disposed) continue;

    // Files already opened in Monaco are synchronized through didOpen/didChange
    // with full document contents. Sending a watched-file notification for the
    // same URI can make some language servers process the same edit twice, so
    // this path is only for unopened files and external workspace changes.
    if (session.syncedDocuments.has(uri)) continue;

    notifyLanguageServer(session, "workspace/didChangeWatchedFiles", {
      changes: [
        {
          uri,
          type: lspWatchedFileChangeTypes[changeType],
        },
      ],
    });
  }
}

function parseEnvironmentOutput(output: string) {
  const parsed: NodeJS.ProcessEnv = {};

  for (const line of output.split(/\r?\n/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    if (!key) continue;
    parsed[key] = value;
  }

  return parsed;
}

function mergePathValues(...values: Array<string | undefined>) {
  const entries = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const entry of value.split(path.delimiter)) {
      const trimmed = entry.trim();
      if (trimmed) entries.add(trimmed);
    }
  }

  return Array.from(entries).join(path.delimiter);
}

function getLoginShellEnvironment(): Promise<NodeJS.ProcessEnv> {
  if (process.platform !== "darwin") {
    return Promise.resolve({} satisfies NodeJS.ProcessEnv);
  }

  if (loginShellEnvironmentPromise) return loginShellEnvironmentPromise;

  loginShellEnvironmentPromise = new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/zsh";
    execFile(
      shell,
      ["-ilc", "/usr/bin/env"],
      {
        env: {
          ...process.env,
          HOME: process.env.HOME ?? app.getPath("home"),
          TMPDIR: process.env.TMPDIR ?? app.getPath("temp"),
        },
        maxBuffer: 256 * 1024,
        timeout: 3_000,
      },
      (err, stdout) => {
        if (err) {
          resolve({});
          return;
        }

        resolve(parseEnvironmentOutput(stdout));
      },
    );
  });

  return loginShellEnvironmentPromise;
}

export async function getManagedLanguageServerSpawnEnvironment(
  env: NodeJS.ProcessEnv | undefined,
) {
  const loginShellEnvironment = await getLoginShellEnvironment();
  const fallbackPath = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
  ].join(path.delimiter);

  // macOS gives apps launched from Dock/Finder a much smaller environment than
  // apps launched from a shell. Native LSP binaries still need HOME for cache
  // directories, TMPDIR for workspace/temp files, and PATH so they can find
  // toolchain helpers when the user has installed them.
  //
  // I read the login shell once because a packaged app opened from Finder or
  // the Dock does not inherit the developer PATH that makes `go env`, `go list`,
  // rustup, pyenv, and similar helpers visible. gopls itself is bundled, but it
  // still shells out to the Go toolchain while analyzing real projects. Without
  // this merge, gopls can initialize successfully and then return no useful
  // completions because the child process cannot see the same Go installation
  // that works when Axon is launched from Terminal.
  return {
    ...loginShellEnvironment,
    ...env,
    HOME: env?.HOME ?? loginShellEnvironment.HOME ?? app.getPath("home"),
    PATH: mergePathValues(loginShellEnvironment.PATH, env?.PATH, fallbackPath),
    TMPDIR: env?.TMPDIR ?? loginShellEnvironment.TMPDIR ?? app.getPath("temp"),
  };
}

export function getActiveLanguageServerSessions() {
  return activeLanguageServers.values();
}

export interface LspFeatureDependencies extends LspSessionDependencies {
  getActiveSessions: () => Iterable<LanguageServerSession>;
  getSessionByKey: (key: string) => LanguageServerSession | undefined;
  getActiveSessionCountForFolder: (folderPath: string) => number;
  getLanguageServerSessionByLanguage: (
    folderPath: string,
    languageId: string,
  ) => LanguageServerSession | null;
  setActiveSession: (key: string, session: LanguageServerSession) => void;
  deleteActiveSession: (key: string) => void;
  setSessionFailure: (key: string, message: string) => void;
  deleteSessionFailure: (key: string) => void;
  getSessionFailure: (
    key: string,
  ) => { message: string; timestamp: number } | undefined;
  hasSession: (key: string) => boolean;
  stopAllSessionsForFolder: (folderPath: string) => void;
  stopAllSessions: () => void;
  isSessionStopping: (key: string) => boolean;
  addSessionStoppingKey: (key: string) => void;
  removeSessionStoppingKey: (key: string) => void;
  isSessionWarming: (key: string) => boolean;
  addSessionWarmingKey: (key: string) => void;
  removeSessionWarmingKey: (key: string) => void;
}

export function normalizeLanguageServerTextPosition(position: unknown) {
  if (!position || typeof position !== "object") return undefined;
  const rawPosition = position as { line?: unknown; character?: unknown };
  if (
    typeof rawPosition.line !== "number" ||
    typeof rawPosition.character !== "number"
  ) {
    return undefined;
  }

  return {
    line: Math.max(0, rawPosition.line),
    character: Math.max(0, rawPosition.character),
  };
}

export function normalizeLanguageServerTextEdit(edit: unknown) {
  if (!edit || typeof edit !== "object") return undefined;
  const rawEdit = edit as {
    range?: unknown;
    newText?: unknown;
  };
  if (typeof rawEdit.newText !== "string") return undefined;
  if (!rawEdit.range || typeof rawEdit.range !== "object") return undefined;

  const rawRange = rawEdit.range as { start?: unknown; end?: unknown };
  const start = normalizeLanguageServerTextPosition(rawRange.start);
  const end = normalizeLanguageServerTextPosition(rawRange.end);
  if (!start || !end) return undefined;

  return {
    range: { start, end },
    newText: rawEdit.newText,
  };
}

export function normalizeLanguageServerTextEdits(edits: unknown) {
  if (!Array.isArray(edits)) return undefined;
  const normalizedEdits = edits
    .map(normalizeLanguageServerTextEdit)
    .filter((edit): edit is NonNullable<typeof edit> => edit !== undefined);

  return normalizedEdits.length > 0 ? normalizedEdits : undefined;
}

export function normalizeLanguageServerTextRange(range: unknown) {
  if (!range || typeof range !== "object") return undefined;
  const rawRange = range as { start?: unknown; end?: unknown };
  const start = normalizeLanguageServerTextPosition(rawRange.start);
  const end = normalizeLanguageServerTextPosition(rawRange.end);
  if (!start || !end) return undefined;

  return { start, end };
}

export function normalizeLanguageServerLocation(location: unknown) {
  if (!location || typeof location !== "object") return undefined;
  const rawLocation = location as {
    uri?: unknown;
    targetUri?: unknown;
    range?: unknown;
    targetSelectionRange?: unknown;
  };
  const rawUri = rawLocation.uri ?? rawLocation.targetUri;
  if (typeof rawUri !== "string") return undefined;

  let filePath = "";
  try {
    filePath = url.fileURLToPath(rawUri);
  } catch {
    return undefined;
  }

  const range = normalizeLanguageServerTextRange(
    rawLocation.range ?? rawLocation.targetSelectionRange,
  );
  if (!range) return undefined;

  return { filePath, range } satisfies LanguageServerLocation;
}

export function normalizeLanguageServerLocations(result: unknown) {
  const rawLocations = Array.isArray(result) ? result : result ? [result] : [];
  return rawLocations
    .map(normalizeLanguageServerLocation)
    .filter(
      (location): location is LanguageServerLocation => location !== undefined,
    );
}

export function normalizeHoverContents(contents: unknown): string[] {
  const values = Array.isArray(contents) ? contents : [contents];
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (
        value &&
        typeof value === "object" &&
        "value" in value &&
        typeof value.value === "string"
      ) {
        return value.value;
      }
      return "";
    })
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function normalizeHoverResult(result: unknown): {
  contents: string[];
  range?: LanguageServerTextEdit["range"];
} {
  const rawHover =
    result && typeof result === "object"
      ? (result as { contents?: unknown; range?: unknown })
      : null;

  return {
    contents: normalizeHoverContents(rawHover?.contents),
    range: normalizeLanguageServerTextRange(rawHover?.range),
  };
}

export function normalizeWorkspaceEdit(result: unknown) {
  if (!result || typeof result !== "object") return {};
  const rawEdit = result as {
    changes?: unknown;
    documentChanges?: unknown;
  };
  const editsByFile: Record<string, LanguageServerTextEdit[]> = {};

  if (rawEdit.changes && typeof rawEdit.changes === "object") {
    for (const [uri, edits] of Object.entries(rawEdit.changes)) {
      if (!Array.isArray(edits)) continue;

      let filePath = "";
      try {
        filePath = url.fileURLToPath(uri);
      } catch {
        continue;
      }

      const normalizedEdits = edits
        .map(normalizeLanguageServerTextEdit)
        .filter((edit): edit is LanguageServerTextEdit => edit !== undefined);
      if (normalizedEdits.length > 0) editsByFile[filePath] = normalizedEdits;
    }
  }

  if (Array.isArray(rawEdit.documentChanges)) {
    for (const change of rawEdit.documentChanges) {
      if (!change || typeof change !== "object") continue;
      const rawChange = change as {
        textDocument?: { uri?: unknown };
        edits?: unknown;
      };
      if (
        typeof rawChange.textDocument?.uri !== "string" ||
        !Array.isArray(rawChange.edits)
      ) {
        continue;
      }

      let filePath = "";
      try {
        filePath = url.fileURLToPath(rawChange.textDocument.uri);
      } catch {
        continue;
      }

      const normalizedEdits = rawChange.edits
        .map(normalizeLanguageServerTextEdit)
        .filter((edit): edit is LanguageServerTextEdit => edit !== undefined);
      if (normalizedEdits.length > 0) {
        editsByFile[filePath] = [
          ...(editsByFile[filePath] ?? []),
          ...normalizedEdits,
        ];
      }
    }
  }

  return editsByFile;
}

export function resolveLanguageServerIdForMonacoLanguage(languageId: string) {
  const normalizedLanguageId = languageId.toLowerCase();
  if (
    normalizedLanguageId === "typescript" ||
    normalizedLanguageId === "javascript" ||
    normalizedLanguageId === "typescriptreact" ||
    normalizedLanguageId === "javascriptreact"
  ) {
    return "typescript" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "go")
    return "go" satisfies LanguageServerDefinition["id"];
  if (normalizedLanguageId === "rust")
    return "rust" satisfies LanguageServerDefinition["id"];
  if (normalizedLanguageId === "python")
    return "python" satisfies LanguageServerDefinition["id"];
  if (normalizedLanguageId === "java")
    return "java" satisfies LanguageServerDefinition["id"];
  if (normalizedLanguageId === "csharp") {
    return "csharp" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "kotlin") {
    return "kotlin" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "php")
    return "php" satisfies LanguageServerDefinition["id"];
  if (normalizedLanguageId === "lua")
    return "lua" satisfies LanguageServerDefinition["id"];
  if (normalizedLanguageId === "cpp" || normalizedLanguageId === "c") {
    return "cpp" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "dockerfile") {
    return "docker" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "html") {
    return "html" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "astro") {
    return "astro" satisfies LanguageServerDefinition["id"];
  }
  if (
    normalizedLanguageId === "css" ||
    normalizedLanguageId === "scss" ||
    normalizedLanguageId === "less"
  ) {
    return "css" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "json" || normalizedLanguageId === "jsonc") {
    return "json" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "yaml") {
    return "yaml" satisfies LanguageServerDefinition["id"];
  }
  if (normalizedLanguageId === "shell") {
    return "bash" satisfies LanguageServerDefinition["id"];
  }

  return null;
}

function shouldAttachTailwindLanguageServer(languageId: string) {
  const normalizedLanguageId = languageId.toLowerCase();
  return (
    normalizedLanguageId === "typescriptreact" ||
    normalizedLanguageId === "javascriptreact" ||
    normalizedLanguageId === "astro" ||
    normalizedLanguageId === "html" ||
    normalizedLanguageId === "css" ||
    normalizedLanguageId === "scss" ||
    normalizedLanguageId === "less"
  );
}

export function resolveDocumentSyncServerIds(languageId: string) {
  const serverIds = new Set<LanguageServerDefinition["id"]>();
  const primaryServerId = resolveLanguageServerIdForMonacoLanguage(languageId);
  if (primaryServerId) {
    serverIds.add(primaryServerId);
  }
  if (shouldAttachTailwindLanguageServer(languageId)) {
    serverIds.add("tailwind");
  }
  return Array.from(serverIds);
}

export function syncLanguageServerDocument(
  session: LanguageServerSession,
  request: LanguageServerDocumentSyncRequest,
) {
  const uri = url.pathToFileURL(request.filePath).toString();
  const existingDocument = session.syncedDocuments.get(uri);
  const languageId = normalizeDocumentLanguageId(
    request.filePath,
    request.languageId,
  );

  if (!existingDocument) {
    // Completion only makes sense if the server has the latest in-memory text.
    // Axon editors can be dirty, so reading from disk here would make the LSP
    // complete against stale content. Full-text didOpen/didChange is heavier
    // than incremental ranges, but it is deterministic and works across the
    // first server set while the client layer is still small.
    notifyLanguageServer(session, "textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: request.content,
      },
    });
    session.syncedDocuments.set(uri, { version: 1, languageId });
    return uri;
  }

  if (existingDocument.languageId !== languageId) {
    // A document that was first opened with the wrong protocol language id must
    // be reopened, not only changed. TypeScript decides whether JSX is legal
    // from the language id/script kind it saw at didOpen time; a later didChange
    // updates text only and keeps the stale parser mode. Reopening prevents
    // `.tsx` files from staying stuck as plain TypeScript and flooding Problems
    // with parser errors around valid JSX tags.
    notifyLanguageServer(session, "textDocument/didClose", {
      textDocument: { uri },
    });
    notifyLanguageServer(session, "textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: existingDocument.version + 1,
        text: request.content,
      },
    });
    session.syncedDocuments.set(uri, {
      version: existingDocument.version + 1,
      languageId,
    });
    return uri;
  }

  const nextVersion = existingDocument.version + 1;
  notifyLanguageServer(session, "textDocument/didChange", {
    textDocument: {
      uri,
      version: nextVersion,
    },
    contentChanges: [{ text: request.content }],
  });
  session.syncedDocuments.set(uri, {
    version: nextVersion,
    languageId: existingDocument.languageId,
  });
  return uri;
}

function normalizeDocumentLanguageId(filePath: string, languageId: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".tsx") return "typescriptreact";
  if (extension === ".jsx") return "javascriptreact";
  if (extension === ".astro") return "astro";
  return languageId === "cpp" ? "cpp" : languageId;
}

export async function syncDocumentWithLanguageServer(
  request: LanguageServerDocumentSyncRequest,
) {
  const serverIds = resolveDocumentSyncServerIds(request.languageId);
  if (serverIds.length === 0) return;

  for (const serverId of serverIds) {
    const session = activeLanguageServers.get(
      getLanguageServerSessionKey(request.folderPath, serverId),
    );
    if (!session?.initialized) continue;

    syncLanguageServerDocument(session, request);
  }
}

export function notifyLanguageServer(
  session: LanguageServerSession,
  method: string,
  params: unknown,
) {
  writeLanguageServerMessage(session, {
    jsonrpc: "2.0",
    method,
    params,
  });
}

export function handleLanguageServerPayload(
  session: LanguageServerSession,
  payload: unknown,
) {
  if (!payload || typeof payload !== "object") return;

  const message = payload as {
    id?: unknown;
    method?: unknown;
    params?: unknown;
    result?: unknown;
    error?: { message?: string };
  };
  if (message.method === "textDocument/publishDiagnostics") {
    publishLanguageServerDiagnostics(session, message.params);
    return;
  }

  if (message.method && typeof message.id === "number") {
    void handleLanguageServerRequest(
      session,
      message.id,
      message.method,
      message.params,
    );
    return;
  }

  if (typeof message.id !== "number") return;

  const pending = session.pendingRequests.get(message.id);
  if (!pending) return;

  clearTimeout(pending.timeout);
  session.pendingRequests.delete(message.id);

  if (message.error) {
    pending.reject(
      new Error(message.error.message ?? `${session.id} request failed.`),
    );
    return;
  }

  pending.resolve(message.result);
}

function writeLanguageServerResponse(
  session: LanguageServerSession,
  id: number,
  result: unknown,
) {
  writeLanguageServerMessage(session, {
    jsonrpc: "2.0",
    id,
    result,
  });
}

async function getConfigurationValueForSection(
  session: LanguageServerSession,
  section: string,
) {
  if (session.id === "typescript") {
    const preferences = getTypeScriptLanguageServerPreferences();
    const suggest = {
      includeCompletionsForModuleExports: true,
      includeCompletionsForImportStatements: true,
      includePackageJsonAutoImports: "on",
      autoImports: true,
    };

    // TypeScript asks the editor for VS Code-shaped settings after
    // initialization. Auto-import completions from packages such as
    // lucide-react depend on these preferences; returning `{}` makes the server
    // behave like a minimal client and hide many exported symbols.
    if (!section || section === "typescript" || section === "javascript") {
      return { preferences, suggest };
    }
    if (
      section === "typescript.preferences" ||
      section === "javascript.preferences"
    ) {
      return preferences;
    }
    if (section === "typescript.suggest" || section === "javascript.suggest") {
      return suggest;
    }
    return null;
  }

  if (session.id !== "python") {
    // Most bundled servers ask for workspace/configuration after initialize.
    // Returning null is technically allowed by the protocol, but some servers
    // treat it as "the editor has no configuration provider" instead of "use
    // defaults". I return an empty object for the server's own section so gopls,
    // clangd, YAML, Docker, and the other bundled servers get the same boring
    // default configuration shape they receive from mature editors.
    if (!section || section === session.id || section === "gopls") return {};
    return null;
  }

  const pythonSettings = await getPythonLanguageServerSettings(session.folderPath);
  if (!pythonSettings) return null;

  if (!section) return pythonSettings;
  if (section === "python") return pythonSettings.python;
  if (section === "python.pythonPath") return pythonSettings.python.pythonPath;
  if (section === "python.defaultInterpreterPath") {
    return pythonSettings.python.defaultInterpreterPath;
  }
  if (section === "python.venvPath") return pythonSettings.python.venvPath;
  if (section === "python.venv") return pythonSettings.python.venv;
  if (section === "python.analysis") return pythonSettings.python.analysis;
  if (section === "pyright") return {};

  return null;
}

async function getLanguageServerConfigurationResponse(
  session: LanguageServerSession,
  params: unknown,
) {
  const request = params as {
    items?: Array<{
      section?: unknown;
    }>;
  };
  const items = Array.isArray(request?.items) ? request.items : [];

  return Promise.all(items.map((item) =>
    getConfigurationValueForSection(
      session,
      typeof item.section === "string" ? item.section : "",
    ),
  ));
}

async function handleLanguageServerRequest(
  session: LanguageServerSession,
  id: number,
  method: unknown,
  params: unknown,
) {
  if (method === "workspace/configuration") {
    // Pyright pulls configuration from the editor after initialization. This is
    // the part that makes a selected virtual environment reliable: the server
    // can ask for the active python/python.analysis settings whenever it
    // rebuilds import resolution instead of depending on one pushed
    // notification during startup.
    writeLanguageServerResponse(
      session,
      id,
      await getLanguageServerConfigurationResponse(session, params),
    );
    return;
  }

  if (method === "workspace/workspaceFolders") {
    writeLanguageServerResponse(session, id, [
      {
        uri: url.pathToFileURL(session.folderPath).toString(),
        name: path.basename(session.folderPath),
      },
    ]);
    return;
  }

  if (
    method === "window/workDoneProgress/create" ||
    method === "client/registerCapability" ||
    method === "client/unregisterCapability"
  ) {
    writeLanguageServerResponse(session, id, null);
    return;
  }

  emitLanguageServerLog(
    session,
    "info",
    `Unhandled language server request: ${String(method)}`,
  );
  writeLanguageServerResponse(session, id, null);
}

function publishLanguageServerDiagnostics(
  session: LanguageServerSession,
  params: unknown,
) {
  if (!params || typeof params !== "object") return;
  const diagnosticParams = params as {
    uri?: unknown;
    diagnostics?: unknown;
  };
  if (
    typeof diagnosticParams.uri !== "string" ||
    !Array.isArray(diagnosticParams.diagnostics)
  ) {
    return;
  }

  let filePath = "";
  try {
    filePath = url.fileURLToPath(diagnosticParams.uri);
  } catch {
    return;
  }

  const diagnostics = diagnosticParams.diagnostics
    .map((diagnostic): EditorDiagnostic | null => {
      if (!diagnostic || typeof diagnostic !== "object") return null;
      const rawDiagnostic = diagnostic as {
        message?: unknown;
        severity?: unknown;
        source?: unknown;
        code?: unknown;
        range?: {
          start?: { line?: unknown; character?: unknown };
          end?: { line?: unknown; character?: unknown };
        };
      };
      if (typeof rawDiagnostic.message !== "string") return null;

      const line =
        typeof rawDiagnostic.range?.start?.line === "number"
          ? rawDiagnostic.range.start.line + 1
          : 1;
      const column =
        typeof rawDiagnostic.range?.start?.character === "number"
          ? rawDiagnostic.range.start.character + 1
          : 1;
      const endLine =
        typeof rawDiagnostic.range?.end?.line === "number"
          ? rawDiagnostic.range.end.line + 1
          : line;
      const endColumn =
        typeof rawDiagnostic.range?.end?.character === "number"
          ? rawDiagnostic.range.end.character + 1
          : column + 1;
      const severity = normalizeLanguageServerDiagnosticSeverity(
        rawDiagnostic.severity,
      );
      const source =
        typeof rawDiagnostic.source === "string"
          ? rawDiagnostic.source
          : `lsp:${session.id}`;

      return {
        id: `${source}:${filePath}:${line}:${column}:${severity}:${rawDiagnostic.message}`,
        path: filePath,
        message: rawDiagnostic.message,
        line,
        column,
        endLine: Math.max(line, endLine),
        endColumn: Math.max(column + 1, endColumn),
        code:
          typeof rawDiagnostic.code === "string" ||
          typeof rawDiagnostic.code === "number"
            ? rawDiagnostic.code
            : undefined,
        severity,
        source,
      };
    })
    .filter(
      (diagnostic): diagnostic is EditorDiagnostic => diagnostic !== null,
    );

  const pendingKey = diagnosticsPendingKey({
    folderPath: session.folderPath,
    serverId: session.id,
    filePath,
  });
  // Language servers can publish diagnostics on nearly every keystroke. I keep
  // only the latest payload per server/file pair and send it after a short
  // debounce so Monaco marker updates do not compete with typing and document
  // sync while the user is mid-edit.
  pendingDiagnosticsByFile.set(pendingKey, {
    folderPath: session.folderPath,
    filePath,
    serverId: session.id,
    diagnostics,
  });
  const existingTimer = diagnosticsDebounceTimers.get(pendingKey);
  if (existingTimer) clearTimeout(existingTimer);

  diagnosticsDebounceTimers.set(pendingKey, setTimeout(() => {
    diagnosticsDebounceTimers.delete(pendingKey);
    const latest = pendingDiagnosticsByFile.get(pendingKey);
    pendingDiagnosticsByFile.delete(pendingKey);
    if (!latest) return;

    // Fan-out still happens to every live BrowserWindow because Axon can have
    // multiple windows open, but the fan-out is now paid once per debounce
    // window instead of once per raw LSP publish.
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        try {
          window.webContents.send("lsp:diagnostics", latest);
        } catch {
          // Diagnostics can arrive while the app is closing. Dropping one late
          // publish is safe; letting it crash the main process is not.
        }
      }
    }
  }, 80));
}

function normalizeLanguageServerDiagnosticSeverity(
  severity: unknown,
): EditorDiagnostic["severity"] {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    default:
      return "hint";
  }
}

export { getLanguageServerStatus, getReadyLanguageServerSession, getReadyOrWarmLanguageServerSession, requestLanguageServer, startLanguageServerDefinition, startLanguageServerForLanguage, startRelevantLanguageServers, stopAllLanguageServers, stopRelevantLanguageServers } from "./features/lifecycle";
export {
  executeLanguageServerCommand,
  formatLanguageServerDocument,
  getLanguageServerCodeActions,
  getLanguageServerCompletions,
  getLanguageServerDefinitions,
  getLanguageServerHover,
  getLanguageServerReferences,
  getLanguageServerSignatureHelp,
  renameLanguageServerSymbol,
} from "./features/requests";
