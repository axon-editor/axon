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

const activeLanguageServers = new Map<string, LanguageServerSession>();
const activeLanguageServerFailures = new Map<
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
const stoppingLanguageServerKeys = new Set<string>();
const warmingLanguageServerKeys = new Set<string>();
const LANGUAGE_SERVER_INITIALIZE_TIMEOUT_MS = 120_000;
const LANGUAGE_SERVER_INITIALIZE_RETRY_DELAY_MS = 2_000;
const LANGUAGE_SERVER_INITIALIZE_MAX_RETRIES = 2;
const LANGUAGE_SERVER_COMPLETION_WARMUP_WAIT_MS = 8_000;
const LANGUAGE_SERVER_COMPLETION_WARMUP_POLL_MS = 80;
let loginShellEnvironmentPromise: Promise<NodeJS.ProcessEnv> | null = null;

function diagnosticsPendingKey(input: {
  folderPath: string;
  serverId: string;
  filePath: string;
}) {
  return `${input.folderPath}::${input.serverId}::${input.filePath}`;
}

function clearPendingDiagnosticsForSession(session: LanguageServerSession) {
  const prefix = `${session.folderPath}::${session.id}::`;
  for (const [key, timer] of diagnosticsDebounceTimers) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(timer);
    diagnosticsDebounceTimers.delete(key);
    pendingDiagnosticsByFile.delete(key);
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

async function getManagedLanguageServerSpawnEnvironment(
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

function normalizeLanguageServerTextPosition(position: unknown) {
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

function normalizeLanguageServerTextEdit(edit: unknown) {
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

function normalizeLanguageServerTextEdits(edits: unknown) {
  if (!Array.isArray(edits)) return undefined;
  const normalizedEdits = edits
    .map(normalizeLanguageServerTextEdit)
    .filter((edit): edit is NonNullable<typeof edit> => edit !== undefined);

  return normalizedEdits.length > 0 ? normalizedEdits : undefined;
}

function normalizeLanguageServerTextRange(range: unknown) {
  if (!range || typeof range !== "object") return undefined;
  const rawRange = range as { start?: unknown; end?: unknown };
  const start = normalizeLanguageServerTextPosition(rawRange.start);
  const end = normalizeLanguageServerTextPosition(rawRange.end);
  if (!start || !end) return undefined;

  return { start, end };
}

function normalizeLanguageServerLocation(location: unknown) {
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

function normalizeLanguageServerLocations(result: unknown) {
  const rawLocations = Array.isArray(result) ? result : result ? [result] : [];
  return rawLocations
    .map(normalizeLanguageServerLocation)
    .filter(
      (location): location is LanguageServerLocation => location !== undefined,
    );
}

function normalizeHoverContents(contents: unknown): string[] {
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

function normalizeHoverResult(result: unknown): {
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

function normalizeWorkspaceEdit(result: unknown) {
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

function resolveDocumentSyncServerIds(languageId: string) {
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

function syncLanguageServerDocument(
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

function notifyLanguageServer(
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

function handleLanguageServerPayload(
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

function getReadyLanguageServerSession(request: {
  folderPath: string;
  languageId: string;
}) {
  const serverId = resolveLanguageServerIdForMonacoLanguage(request.languageId);
  if (!serverId) {
    return {
      ok: false as const,
      message: `No language server is configured for ${request.languageId}.`,
      session: null,
    };
  }

  const session = activeLanguageServers.get(
    getLanguageServerSessionKey(request.folderPath, serverId),
  );
  if (!session) {
    return {
      ok: false as const,
      message: `${serverId} language server is not running.`,
      session: null,
    };
  }
  if (!session.initialized) {
    return {
      ok: false as const,
      message: `${serverId} language server is still starting.`,
      session: null,
    };
  }

  return { ok: true as const, message: "", session };
}

function requestLanguageServer(
  session: LanguageServerSession,
  method: string,
  params: unknown,
  timeoutMs = 4500,
) {
  session.requestId += 1;
  const id = session.requestId;

  return new Promise<unknown>((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingRequests.delete(id);
      reject(new Error(`${session.id} ${method} timed out.`));
    }, timeoutMs);

    session.pendingRequests.set(id, { resolve, reject, timeout });

    try {
      writeLanguageServerMessage(session, {
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    } catch (err) {
      clearTimeout(timeout);
      session.pendingRequests.delete(id);
      reject(err instanceof Error ? err : new Error(`${method} failed.`));
    }
  });
}

function disposeLanguageServerSession(session: LanguageServerSession) {
  session.disposed = true;
  clearPendingDiagnosticsForSession(session);
  if (session.initializeRetryTimer) {
    clearTimeout(session.initializeRetryTimer);
    session.initializeRetryTimer = null;
  }
}

async function initializeLanguageServer(session: LanguageServerSession) {
  if (
    session.disposed ||
    session.process.killed ||
    session.process.exitCode !== null
  ) {
    return;
  }

  // This is a minimal LSP handshake, not the full client. The important part
  // for this slice is proving Axon can own the server process and negotiate a
  // workspace root from the main process. Diagnostics, document sync, and
  // definition requests can now build on this session instead of inventing a
  // separate process lifecycle later.
  void requestLanguageServer(
    session,
    "initialize",
    {
      processId: process.pid,
      rootUri: url.pathToFileURL(session.folderPath).toString(),
      initializationOptions: await getLanguageServerInitializationOptions(session),
      workspaceFolders: [
        {
          uri: url.pathToFileURL(session.folderPath).toString(),
          name: path.basename(session.folderPath),
        },
      ],
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
          publishDiagnostics: {
            // typescript-language-server explicitly checks this capability
            // before it forwards tsserver semantic/syntax diagnostics to the
            // editor. Without it, completions and hover can work while real
            // type errors such as ts2322 never appear, which makes Axon look
            // healthy until the user expects VS Code/Zed-style squiggles.
            relatedInformation: true,
            versionSupport: true,
            tagSupport: {
              valueSet: [1, 2],
            },
          },
          completion: {
            completionItem: {
              documentationFormat: ["markdown", "plaintext"],
              snippetSupport: true,
              resolveSupport: {
                properties: [
                  "documentation",
                  "detail",
                  "additionalTextEdits",
                  "textEdit",
                  "insertText",
                ],
              },
            },
            contextSupport: true,
            dynamicRegistration: false,
          },
          hover: {
            contentFormat: ["markdown", "plaintext"],
            dynamicRegistration: false,
          },
          definition: {
            dynamicRegistration: false,
          },
          references: {
            dynamicRegistration: false,
          },
          rename: {
            dynamicRegistration: false,
            prepareSupport: true,
          },
          formatting: {
            dynamicRegistration: false,
          },
          signatureHelp: {
            dynamicRegistration: false,
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
              parameterInformation: {
                labelOffsetSupport: true,
              },
            },
          },
          codeAction: {
            dynamicRegistration: false,
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  "",
                  "quickfix",
                  "refactor",
                  "refactor.extract",
                  "refactor.inline",
                  "refactor.rewrite",
                  "source",
                  "source.organizeImports",
                ],
              },
            },
          },
        },
        workspace: {
          configuration: true,
          workspaceFolders: true,
        },
      },
    },
    LANGUAGE_SERVER_INITIALIZE_TIMEOUT_MS,
  )
    .then(() => {
      console.log("[LSP SPAWN OK]", session.id);
      if (session.disposed) return;
      notifyLanguageServer(session, "initialized", {});
      void notifyLanguageServerConfiguration(session, notifyLanguageServer);
      console.log("[LSP INIT OK]", session.id);
      session.initialized = true;
      session.initializeRetryCount = 0;
      emitLanguageServerLog(session, "info", `${session.id} initialized.`);
    })
    .catch((err) => {
      console.error("[LSP INIT FAIL]", session.id, err.message, session.stderr);
      if (
        session.disposed ||
        session.process.killed ||
        session.process.exitCode !== null
      ) {
        return;
      }

      session.stderr = `${session.stderr}\n${err.message}`.slice(-4000);
      emitLanguageServerLog(session, "error", err.message);

      if (
        session.initializeRetryCount >= LANGUAGE_SERVER_INITIALIZE_MAX_RETRIES
      ) {
        return;
      }

      session.initializeRetryCount += 1;
      // Some managed servers do real project indexing before answering
      // initialize. Retrying after a timeout lets the same process recover when
      // it was merely slow, while the disposed/process checks above prevent
      // stale retries after a manual stop or crash.
      session.initializeRetryTimer = setTimeout(() => {
        session.initializeRetryTimer = null;
        void initializeLanguageServer(session);
      }, LANGUAGE_SERVER_INITIALIZE_RETRY_DELAY_MS);
    });
}

function startLanguageServerDefinition(
  folderPath: string,
  definition: LanguageServerDefinition,
): Promise<LanguageServerStartAttempt> {
  const resolved = resolveLanguageServerCommand(definition, folderPath);
  const key = getLanguageServerSessionKey(folderPath, definition.id);
  if (activeLanguageServers.has(key)) {
    return Promise.resolve({
      label: definition.label,
      ok: true,
      message: `${definition.label} is already running.`,
    });
  }

  return canRunCommand(resolved.command, resolved.args).then(
    async (available) => {
      if (!available) {
        activeLanguageServerFailures.set(key, {
          message: definition.installHint,
          timestamp: Date.now(),
        });
        return {
          label: definition.label,
          ok: false,
          message: `${definition.label}: ${definition.installHint}`,
        };
      }
      if (!resolved.startable) {
        activeLanguageServerFailures.set(key, {
          message: definition.installHint,
          timestamp: Date.now(),
        });
        return {
          label: definition.label,
          ok: false,
          message: `${definition.label}: ${definition.installHint}`,
        };
      }

      const launchCommand = resolveCommandPath(resolved.launchCommand);

      try {
        const spawnEnvironment = await getManagedLanguageServerSpawnEnvironment(
          resolved.env,
        );
        const child = spawn(launchCommand, resolved.launchArgs, {
          cwd: folderPath,
          env: spawnEnvironment,
          stdio: "pipe",
        });
        const session: LanguageServerSession = {
          id: definition.id,
          folderPath,
          process: child,
          requestId: 0,
          initialized: false,
          disposed: false,
          initializeRetryCount: 0,
          initializeRetryTimer: null,
          stderr: "",
          stdoutBuffer: Buffer.alloc(0),
          pendingRequests: new Map(),
          syncedDocuments: new Map(),
        };

        child.stdout.on("data", (chunk: Buffer) => {
          readLanguageServerMessages(
            session,
            chunk,
            handleLanguageServerPayload,
          );
        });
        child.stderr.on("data", (chunk) => {
          const message = chunk.toString();
          session.stderr = `${session.stderr}${message}`.slice(-4000);
          emitLanguageServerLog(session, "error", message);
        });

        // waitForLanguageServerSpawn resolves when the process emits 'spawn'.
        // Returning this promise means the caller learns whether the initial
        // spawn succeeded or failed -- which is what the App.tsx retry gate
        // depends on to release the startKey on failure.
        return waitForLanguageServerSpawn(child, definition.label)
          .then(() => {
            activeLanguageServers.set(key, session);
            activeLanguageServerFailures.delete(key);
            child.on("exit", () => {
              disposeLanguageServerSession(session);
              if (stoppingLanguageServerKeys.has(key)) {
                stoppingLanguageServerKeys.delete(key);
              } else {
                activeLanguageServerFailures.set(key, {
                  message: [
                    `${definition.label} language server exited.`,
                    session.stderr.trim(),
                  ]
                    .filter(Boolean)
                    .join("\n"),
                  timestamp: Date.now(),
                });
              }
              rejectLanguageServerPendingRequests(
                session,
                new Error(`${definition.label} language server exited.`),
              );
              activeLanguageServers.delete(key);
            });
            child.on("error", (err) => {
              disposeLanguageServerSession(session);
              activeLanguageServerFailures.set(key, {
                message:
                  err.message || `${definition.label} language server failed.`,
                timestamp: Date.now(),
              });
              rejectLanguageServerPendingRequests(
                session,
                new Error(`${definition.label} language server failed.`),
              );
              activeLanguageServers.delete(key);
            });

            void initializeLanguageServer(session);

            return {
              label: definition.label,
              ok: true,
              message: `${definition.label} started.`,
            };
          })
          .catch((err) => {
            disposeLanguageServerSession(session);
            activeLanguageServerFailures.set(key, {
              message: [
                err instanceof Error
                  ? err.message
                  : `${definition.label} failed to start.`,
                session.stderr.trim(),
              ]
                .filter(Boolean)
                .join("\n"),
              timestamp: Date.now(),
            });
            rejectLanguageServerPendingRequests(
              session,
              new Error(`${definition.label} language server failed.`),
            );
            activeLanguageServers.delete(key);

            // Returning ok:false here is what makes the App.tsx retry gate work.
            // Without this, the renderer always sees ok:true and never releases
            // the startKey, which permanently blocks the retry on the next file open.
            return {
              label: definition.label,
              ok: false,
              message:
                err instanceof Error
                  ? err.message
                  : `${definition.label} failed to start.`,
            };
          });
      } catch (err) {
        activeLanguageServers.delete(key);
        activeLanguageServerFailures.set(key, {
          message:
            err instanceof Error ? err.message : `${definition.label} failed.`,
          timestamp: Date.now(),
        });
        return {
          label: definition.label,
          ok: false,
          message: `${definition.label}: ${(err as Error).message}`,
        };
      }
    },
  );
}

function waitForReadyLanguageServerSession(
  key: string,
  timeoutMs = LANGUAGE_SERVER_COMPLETION_WARMUP_WAIT_MS,
): Promise<LanguageServerSession | undefined> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const poll = () => {
      const session = activeLanguageServers.get(key);
      if (session?.initialized && !session.disposed) {
        resolve(session);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(undefined);
        return;
      }

      setTimeout(poll, LANGUAGE_SERVER_COMPLETION_WARMUP_POLL_MS);
    };

    poll();
  });
}

export async function startRelevantLanguageServers(
  folderPath: string,
): Promise<LanguageServerLifecycleResult> {
  const statuses = await getLanguageServerStatus(folderPath);
  const startableServers = statuses.filter(
    (server) =>
      server.relevant &&
      server.available &&
      server.startable &&
      !server.running,
  );
  const attempts: LanguageServerStartAttempt[] = [];

  for (const status of startableServers) {
    const definition = LANGUAGE_SERVER_DEFINITIONS.find(
      (candidate) => candidate.id === status.id,
    );
    if (!definition) continue;
    attempts.push(await startLanguageServerDefinition(folderPath, definition));
  }

  const nextStatuses = await getLanguageServerStatus(folderPath);
  const failedAttempts = attempts.filter((attempt) => !attempt.ok);
  const startedCount = attempts.filter((attempt) => attempt.ok).length;
  return {
    ok: failedAttempts.length === 0,
    message:
      startableServers.length === 0
        ? "No relevant language servers needed to start."
        : failedAttempts.length > 0
          ? `Started ${startedCount}. Failed: ${failedAttempts.map((attempt) => attempt.message).join("; ")}`
          : `Started ${startedCount} language server${startedCount === 1 ? "" : "s"}.`,
    servers: nextStatuses,
  };
}

export async function startLanguageServerForLanguage(
  folderPath: string,
  languageId: string,
): Promise<LanguageServerLifecycleResult> {
  const serverIds = resolveDocumentSyncServerIds(languageId);
  if (serverIds.length === 0) {
    return {
      ok: true,
      message: `No external language server is configured for ${languageId}.`,
      servers: await getLanguageServerStatus(folderPath),
    };
  }

  // Marker-based startup is useful when a workspace opens, but completions are
  // driven by the active document. Starting the server for the file language
  // means a lone .py, .rs, .go, or .cpp file can still attach to its server.
  // Web files can also belong to Tailwind, so TSX/JSX/HTML/CSS start both the
  // structural language server and Tailwind's companion diagnostics server.
  const attempts: LanguageServerStartAttempt[] = [];
  for (const serverId of serverIds) {
    const definition = LANGUAGE_SERVER_DEFINITIONS.find(
      (candidate) => candidate.id === serverId,
    );
    if (!definition) {
      attempts.push({
        label: serverId,
        ok: false,
        message: `No language server definition found for ${serverId}.`,
      });
      continue;
    }
    attempts.push(await startLanguageServerDefinition(folderPath, definition));
  }

  const failedAttempts = attempts.filter((attempt) => !attempt.ok);
  return {
    ok: failedAttempts.length === 0,
    message:
      failedAttempts.length > 0
        ? failedAttempts.map((attempt) => attempt.message).join("; ")
        : attempts.map((attempt) => attempt.message).join(" "),
    servers: await getLanguageServerStatus(folderPath),
  };
}

export async function stopRelevantLanguageServers(
  folderPath: string,
): Promise<LanguageServerLifecycleResult> {
  const beforeCount = Array.from(activeLanguageServers.values()).filter(
    (session) => path.resolve(session.folderPath) === path.resolve(folderPath),
  ).length;

  for (const [key, session] of activeLanguageServers.entries()) {
    if (path.resolve(session.folderPath) === path.resolve(folderPath)) {
      stoppingLanguageServerKeys.add(key);
      activeLanguageServerFailures.delete(key);
      disposeLanguageServerSession(session);
      try {
        writeLanguageServerMessage(session, {
          jsonrpc: "2.0",
          id: session.requestId + 1,
          method: "shutdown",
          params: null,
        });
        writeLanguageServerMessage(session, {
          jsonrpc: "2.0",
          method: "exit",
          params: {},
        });
      } catch {
        // The process may already be exiting. The cleanup below still removes the
        // stale session and kills anything that did not accept the graceful exit.
      }

      rejectLanguageServerPendingRequests(
        session,
        new Error(`${session.id} language server stopped.`),
      );
      session.process.kill();
      activeLanguageServers.delete(key);
    }
  }

  return {
    ok: true,
    message:
      beforeCount === 0
        ? "No language servers were running for this workspace."
        : `Stopped ${beforeCount} language server${beforeCount === 1 ? "" : "s"}.`,
    servers: await getLanguageServerStatus(folderPath),
  };
}

export async function stopAllLanguageServers(): Promise<LanguageServerLifecycleResult> {
  const beforeCount = activeLanguageServers.size;

  for (const [key, session] of activeLanguageServers.entries()) {
    stoppingLanguageServerKeys.add(key);
    activeLanguageServerFailures.delete(key);
    disposeLanguageServerSession(session);
    try {
      writeLanguageServerMessage(session, {
        jsonrpc: "2.0",
        id: session.requestId + 1,
        method: "shutdown",
        params: null,
      });
      writeLanguageServerMessage(session, {
        jsonrpc: "2.0",
        method: "exit",
        params: {},
      });
    } catch {
      // The process may already be exiting. The cleanup below still removes the
      // stale session and kills anything that did not accept the graceful exit.
    }

    rejectLanguageServerPendingRequests(
      session,
      new Error(`${session.id} language server stopped.`),
    );
    session.process.kill();
    activeLanguageServers.delete(key);
  }

  return {
    ok: true,
    message:
      beforeCount === 0
        ? "No language servers were running for this workspace."
        : `Stopped ${beforeCount} language server${beforeCount === 1 ? "" : "s"}.`,
    servers: [],
  };
}

export function getLanguageServerStatus(
  folderPath: string,
): Promise<LanguageServerStatus[]> {
  return Promise.all(
    LANGUAGE_SERVER_DEFINITIONS.map(async (definition) => {
      const resolved = resolveLanguageServerCommand(definition, folderPath);
      const relevant = hasWorkspaceMarker(
        folderPath,
        definition.workspaceMarkers,
      );
      const available = await canRunCommand(resolved.command, resolved.args);
      const sessionKey = getLanguageServerSessionKey(folderPath, definition.id);
      const running = activeLanguageServers.has(sessionKey);
      const lastFailure = activeLanguageServerFailures.get(sessionKey);
      const failed = Boolean(lastFailure && !running);
      const pythonSettings =
        definition.id === "python"
          ? await getPythonLanguageServerSettings(folderPath)
          : null;
      const pythonInterpreter =
        definition.id === "python"
          ? pythonSettings?.python.defaultInterpreterPath
          : "";
      const status = running
        ? "running"
        : failed
          ? "failed"
          : available
            ? "available"
            : "missing";
      const bundled = Boolean(
        definition.bundledNodeServer ||
          definition.managedBundle ||
          ["typescript", "docker", "tailwind"].includes(definition.id),
      );

      return {
        id: definition.id,
        label: definition.label,
        languages: definition.languages,
        status,
        available,
        relevant,
        running,
        startable: resolved.startable,
        bundled,
        command: resolved.command,
        detail: failed
          ? "Failed to start. Open LSP logs for details."
          : running
            ? bundled
              ? "Running from Axon's bundled server"
              : "Running from the system server"
            : available
              ? relevant
                ? bundled
                  ? "Bundled and ready for this workspace"
                  : "Installed and ready for this workspace"
                : bundled
                  ? "Bundled, but no matching workspace markers found"
                  : "Installed, but no matching workspace markers found"
              : relevant
                ? "Relevant, but the language server is not available"
                : "Not available",
        installHint: definition.installHint,
        runtimeRequirement: definition.runtimeRequirement,
        lastError: lastFailure?.message,
        runtimeHint:
          definition.id === "python"
            ? pythonInterpreter
              ? `Interpreter: ${pythonInterpreter}`
              : "Using Pyright's default Python resolution"
            : undefined,
      };
    }),
  );
}

export async function getLanguageServerCompletions(
  request: LanguageServerCompletionRequest,
): Promise<LanguageServerCompletionResult> {
  const serverId = resolveLanguageServerIdForMonacoLanguage(request.languageId);
  if (!serverId) {
    return { ok: true, items: [] };
  }

  let session = activeLanguageServers.get(
    getLanguageServerSessionKey(request.folderPath, serverId),
  );
  if (!session) {
    const definition = LANGUAGE_SERVER_DEFINITIONS.find(
      (candidate) => candidate.id === serverId,
    );
    if (!definition) return { ok: true, items: [] };

    const resolved = resolveLanguageServerCommand(
      definition,
      request.folderPath,
    );
    const available = await canRunCommand(resolved.command, resolved.args);
    if (!available || !resolved.startable) {
      return { ok: true, items: [] };
    }

    const sessionKey = getLanguageServerSessionKey(
      request.folderPath,
      serverId,
    );
    if (!warmingLanguageServerKeys.has(sessionKey)) {
      warmingLanguageServerKeys.add(sessionKey);
      void startLanguageServerDefinition(
        request.folderPath,
        definition,
      ).finally(() => warmingLanguageServerKeys.delete(sessionKey));
    }

    // The first completion request is often the user's proof that a language
    // server is alive. Returning immediately while the server is still warming
    // up makes Go/Rust/Python feel broken in packaged builds even when the
    // bundled server starts correctly milliseconds later, so I wait briefly for
    // initialization and then use the same request path as a warm session.
    session = await waitForReadyLanguageServerSession(sessionKey);
    if (!session) return { ok: true, items: [] };
  }

  if (!session.initialized) {
    const sessionKey = getLanguageServerSessionKey(
      request.folderPath,
      serverId,
    );
    // The app may auto-start a server as soon as a file opens. In that case a
    // completion request can arrive while the session exists but is still
    // initializing, which used to return an empty popup and make Go look like
    // it had no LSP. Waiting here covers both cold-start paths: no session yet,
    // and already-started-but-not-ready.
    session = await waitForReadyLanguageServerSession(sessionKey);
    if (!session) return { ok: true, items: [] };
  }

  try {
    const uri = syncLanguageServerDocument(session, request);
    const completionResult = await requestLanguageServer(
      session,
      "textDocument/completion",
      {
        textDocument: { uri },
        position: {
          line: Math.max(0, request.line - 1),
          character: Math.max(0, request.column - 1),
        },
        context: {
          triggerKind: request.triggerCharacter ? 2 : 1,
          triggerCharacter: request.triggerCharacter,
        },
      },
    );
    const completionItems =
      normalizeLanguageServerCompletionItems(completionResult);
    const resolvedCompletionItems =
      serverId === "typescript"
        ? await resolveTypeScriptCompletionItems(session, completionItems)
        : completionItems;

    return {
      ok: true,
      items: resolvedCompletionItems,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Language server completion failed.",
      items: [],
    };
  }
}

async function resolveTypeScriptCompletionItems(
  session: LanguageServerSession,
  items: ReturnType<typeof normalizeLanguageServerCompletionItems>,
) {
  const resolveLimit = 80;
  const resolvedItems = await Promise.all(
    items.slice(0, resolveLimit).map(async (item) => {
      if (!item.data) return item;

      try {
        const resolved = await requestLanguageServer(
          session,
          "completionItem/resolve",
          item,
          2500,
        );
        const normalized = normalizeLanguageServerCompletionItems([resolved]);
        return normalized[0] ?? item;
      } catch {
        return item;
      }
    }),
  );

  return [...resolvedItems, ...items.slice(resolveLimit)];
}

export async function getLanguageServerHover(
  request: LanguageServerHoverRequest,
): Promise<LanguageServerHoverResult> {
  const serverIds = resolveDocumentSyncServerIds(request.languageId);
  if (serverIds.length === 0) {
    return {
      ok: false,
      message: `No language server is configured for ${request.languageId}.`,
      contents: [],
    };
  }

  const sessions = serverIds
    .map((serverId) =>
      activeLanguageServers.get(
        getLanguageServerSessionKey(request.folderPath, serverId),
      ),
    )
    .filter((session): session is LanguageServerSession =>
      Boolean(session?.initialized && !session.disposed),
    );

  if (sessions.length === 0) {
    return {
      ok: false,
      message: `${serverIds.join(", ")} language server is not running.`,
      contents: [],
    };
  }

  try {
    const hoverResults = await Promise.all(
      sessions.map(async (session) => {
        try {
          const uri = syncLanguageServerDocument(session, request);
          const hoverResult = await requestLanguageServer(
            session,
            "textDocument/hover",
            {
              textDocument: { uri },
              position: {
                line: Math.max(0, request.line - 1),
                character: Math.max(0, request.column - 1),
              },
            },
          );

          return {
            sessionId: session.id,
            ...normalizeHoverResult(hoverResult),
          };
        } catch {
          return {
            sessionId: session.id,
            contents: [],
            range: undefined,
          };
        }
      }),
    );

    const nonEmptyResults = hoverResults.filter(
      (result) => result.contents.length > 0,
    );
    const tailwindResult = nonEmptyResults.find(
      (result) => result.sessionId === "tailwind",
    );
    const orderedResults = tailwindResult
      ? [
          tailwindResult,
          ...nonEmptyResults.filter((result) => result !== tailwindResult),
        ]
      : nonEmptyResults;

    return {
      ok: true,
      contents: orderedResults.flatMap((result) => {
        if (result.sessionId !== "tailwind") return result.contents;
        return result.contents.map((content) => {
          // Tailwind hover payloads are already Markdown and often contain the
          // generated CSS block users expect from VS Code/Zed. Prefixing only
          // the server label keeps merged hover cards understandable without
          // flattening Tailwind's own formatting.
          return `**Tailwind CSS**\n\n${content}`;
        });
      }),
      range: orderedResults.find((result) => result.range)?.range ?? undefined,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Language server hover failed.",
      contents: [],
    };
  }
}

export async function getLanguageServerDefinitions(
  request: LanguageServerDefinitionRequest,
): Promise<LanguageServerDefinitionResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return { ok: false, message: ready.message, locations: [] };
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const definitionResult = await requestLanguageServer(
      ready.session,
      "textDocument/definition",
      {
        textDocument: { uri },
        position: {
          line: Math.max(0, request.line - 1),
          character: Math.max(0, request.column - 1),
        },
      },
    );

    return {
      ok: true,
      locations: normalizeLanguageServerLocations(definitionResult),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Language server definition failed.",
      locations: [],
    };
  }
}

export async function getLanguageServerReferences(
  request: LanguageServerReferencesRequest,
): Promise<LanguageServerReferencesResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return { ok: false, message: ready.message, locations: [] };
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const referencesResult = await requestLanguageServer(
      ready.session,
      "textDocument/references",
      {
        textDocument: { uri },
        position: {
          line: Math.max(0, request.line - 1),
          character: Math.max(0, request.column - 1),
        },
        context: {
          includeDeclaration: request.includeDeclaration ?? true,
        },
      },
    );

    return {
      ok: true,
      locations: normalizeLanguageServerLocations(referencesResult),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Language server references failed.",
      locations: [],
    };
  }
}

export async function renameLanguageServerSymbol(
  request: LanguageServerRenameRequest,
): Promise<LanguageServerRenameResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return { ok: false, message: ready.message, edits: {} };
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const renameResult = await requestLanguageServer(
      ready.session,
      "textDocument/rename",
      {
        textDocument: { uri },
        position: {
          line: Math.max(0, request.line - 1),
          character: Math.max(0, request.column - 1),
        },
        newName: request.newName,
      },
    );

    return {
      ok: true,
      edits: normalizeWorkspaceEdit(renameResult),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Language server rename failed.",
      edits: {},
    };
  }
}

export async function formatLanguageServerDocument(
  request: LanguageServerFormatRequest,
): Promise<LanguageServerFormatResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    const prettierResult = await formatWithBundledPrettier(request);
    if (prettierResult) return prettierResult;
    return { ok: false, message: ready.message, edits: [] };
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const formatResult = await requestLanguageServer(
      ready.session,
      "textDocument/formatting",
      {
        textDocument: { uri },
        options: {
          tabSize: request.tabSize,
          insertSpaces: request.insertSpaces,
          trimTrailingWhitespace: true,
          insertFinalNewline: true,
        },
      },
    );

    const edits = normalizeLanguageServerTextEdits(formatResult) ?? [];
    if (edits.length > 0) {
      return {
        ok: true,
        edits,
      };
    }

    const prettierResult = await formatWithBundledPrettier(request);
    if (prettierResult) return prettierResult;

    return {
      ok: true,
      edits: [],
    };
  } catch (err) {
    const prettierResult = await formatWithBundledPrettier(request);
    if (prettierResult) return prettierResult;

    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Language server format failed.",
      edits: [],
    };
  }
}

function normalizeSignatureDocumentation(documentation: unknown) {
  if (typeof documentation === "string") return documentation;
  if (
    documentation &&
    typeof documentation === "object" &&
    "value" in documentation &&
    typeof documentation.value === "string"
  ) {
    return documentation.value;
  }

  return undefined;
}

function normalizeSignatureParameter(parameter: unknown) {
  if (!parameter || typeof parameter !== "object") return undefined;
  const rawParameter = parameter as {
    label?: unknown;
    documentation?: unknown;
  };
  const label = Array.isArray(rawParameter.label)
    ? rawParameter.label.join(":")
    : rawParameter.label;
  if (typeof label !== "string") return undefined;

  return {
    label,
    documentation: normalizeSignatureDocumentation(rawParameter.documentation),
  };
}

function normalizeLanguageServerSignatures(result: unknown) {
  if (!result || typeof result !== "object") {
    return {
      signatures: [],
      activeSignature: undefined,
      activeParameter: undefined,
    };
  }

  const rawResult = result as {
    signatures?: unknown;
    activeSignature?: unknown;
    activeParameter?: unknown;
  };
  const signatures = Array.isArray(rawResult.signatures)
    ? rawResult.signatures
        .map((signature): LanguageServerSignature | null => {
          if (!signature || typeof signature !== "object") return null;
          const rawSignature = signature as {
            label?: unknown;
            documentation?: unknown;
            parameters?: unknown;
            activeParameter?: unknown;
          };
          if (typeof rawSignature.label !== "string") return null;

          return {
            label: rawSignature.label,
            documentation: normalizeSignatureDocumentation(
              rawSignature.documentation,
            ),
            parameters: Array.isArray(rawSignature.parameters)
              ? rawSignature.parameters
                  .map(normalizeSignatureParameter)
                  .filter(
                    (parameter): parameter is NonNullable<typeof parameter> =>
                      parameter !== undefined,
                  )
              : [],
            activeParameter:
              typeof rawSignature.activeParameter === "number"
                ? rawSignature.activeParameter
                : undefined,
          };
        })
        .filter(
          (signature): signature is LanguageServerSignature =>
            signature !== null,
        )
    : [];

  return {
    signatures,
    activeSignature:
      typeof rawResult.activeSignature === "number"
        ? rawResult.activeSignature
        : undefined,
    activeParameter:
      typeof rawResult.activeParameter === "number"
        ? rawResult.activeParameter
        : undefined,
  };
}

export async function getLanguageServerSignatureHelp(
  request: LanguageServerSignatureHelpRequest,
): Promise<LanguageServerSignatureHelpResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return { ok: false, message: ready.message, signatures: [] };
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const signatureResult = await requestLanguageServer(
      ready.session,
      "textDocument/signatureHelp",
      {
        textDocument: { uri },
        position: {
          line: Math.max(0, request.line - 1),
          character: Math.max(0, request.column - 1),
        },
        context: {
          triggerKind: request.triggerCharacter ? 2 : 1,
          triggerCharacter: request.triggerCharacter,
          isRetrigger: false,
        },
      },
    );
    return {
      ok: true,
      ...normalizeLanguageServerSignatures(signatureResult),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Language server signature help failed.",
      signatures: [],
    };
  }
}

function normalizeLanguageServerCodeActions(result: unknown) {
  const rawActions = Array.isArray(result) ? result : [];
  return rawActions
    .map((action): LanguageServerCodeAction | null => {
      if (!action || typeof action !== "object") return null;
      const rawAction = action as {
        title?: unknown;
        kind?: unknown;
        edit?: unknown;
        command?: unknown;
      };
      if (typeof rawAction.title !== "string") return null;

      return {
        title: rawAction.title,
        kind: typeof rawAction.kind === "string" ? rawAction.kind : undefined,
        command: normalizeLanguageServerCommand(rawAction.command),
        edits: normalizeWorkspaceEdit(rawAction.edit),
      };
    })
    .filter((action): action is LanguageServerCodeAction => action !== null);
}

function normalizeLanguageServerCommand(
  command: unknown,
): LanguageServerCommand | undefined {
  if (!command || typeof command !== "object") return undefined;
  const rawCommand = command as {
    title?: unknown;
    command?: unknown;
    arguments?: unknown;
  };
  if (typeof rawCommand.command !== "string") return undefined;

  return {
    title: typeof rawCommand.title === "string" ? rawCommand.title : undefined,
    command: rawCommand.command,
    arguments: Array.isArray(rawCommand.arguments)
      ? rawCommand.arguments
      : undefined,
  };
}

export async function getLanguageServerCodeActions(
  request: LanguageServerCodeActionRequest,
): Promise<LanguageServerCodeActionResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return { ok: false, message: ready.message, actions: [] };
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const codeActionResult = await requestLanguageServer(
      ready.session,
      "textDocument/codeAction",
      {
        textDocument: { uri },
        range: request.range,
        context: {
          // Quick-fix actions depend on the diagnostics that triggered the
          // lightbulb. Servers such as TypeScript use this context to decide
          // whether they should offer import fixes, type fixes, organize
          // imports, or refactors. Axon keeps the user-facing diagnostics in
          // Monaco/React state, so the renderer sends the markers around the
          // requested range back here instead of making the main process keep a
          // second raw diagnostic cache that can drift from the visible editor.
          diagnostics: request.diagnostics ?? [],
          only: undefined,
        },
      },
    );

    return {
      ok: true,
      actions: normalizeLanguageServerCodeActions(codeActionResult),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Language server code action failed.",
      actions: [],
    };
  }
}

export async function executeLanguageServerCommand(
  request: LanguageServerExecuteCommandRequest,
): Promise<LanguageServerExecuteCommandResult> {
  const ready = getReadyLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return { ok: false, message: ready.message, edits: {} };
  }

  try {
    const result = await requestLanguageServer(
      ready.session,
      "workspace/executeCommand",
      {
        command: request.command,
        arguments: request.arguments ?? [],
      },
      10000,
    );

    return {
      ok: true,
      edits: normalizeWorkspaceEdit(result),
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Language server command failed.",
      edits: {},
    };
  }
}
