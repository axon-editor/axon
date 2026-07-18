import path from "path";
import url from "url";
import { spawn } from "child_process";
import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
  type LanguageServerLifecycleResult,
  type LanguageServerSemanticTokensProvider,
  type LanguageServerStatus,
} from "../../../shared/lsp";
import {
  LANGUAGE_SERVER_DEFINITIONS,
  type LanguageServerDefinition,
  type LanguageServerStartAttempt,
} from "../definitions";
import {
  activeLanguageServerFailures,
  activeLanguageServers,
  clearPendingDiagnosticsForSession,
  getManagedLanguageServerSpawnEnvironment,
  handleLanguageServerPayload,
  LANGUAGE_SERVER_COMPLETION_WARMUP_POLL_MS,
  LANGUAGE_SERVER_COMPLETION_WARMUP_WAIT_MS,
  LANGUAGE_SERVER_INITIALIZE_MAX_RETRIES,
  LANGUAGE_SERVER_INITIALIZE_RETRY_DELAY_MS,
  LANGUAGE_SERVER_INITIALIZE_TIMEOUT_MS,
  notifyLanguageServer,
  resolveDocumentSyncServerIds,
  resolveLanguageServerIdForMonacoLanguage,
  stoppingLanguageServerKeys,
  warmingLanguageServerKeys,
} from "../features";
import {
  canRunCommand,
  emitLanguageServerLog,
  getLanguageServerInitializationOptions,
  getLanguageServerSessionKey,
  getPythonLanguageServerSettings,
  hasWorkspaceMarker,
  notifyLanguageServerConfiguration,
  readLanguageServerMessages,
  rejectLanguageServerPendingRequests,
  resolveCommandPath,
  resolveLanguageServerCommand,
  type LanguageServerSession,
  waitForLanguageServerSpawn,
  writeLanguageServerMessage,
} from "../session";
import {
  createTypeScriptExternalProjectsRequest,
  discoverTypeScriptProjectConfigs,
} from "../typescriptProjects";

export function getReadyLanguageServerSession(request: {
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

export async function getReadyOrWarmLanguageServerSession(request: {
  folderPath: string;
  languageId: string;
}) {
  const ready = getReadyLanguageServerSession(request);
  if (ready.ok && ready.session) return ready;

  const serverId = resolveLanguageServerIdForMonacoLanguage(request.languageId);
  if (!serverId) return ready;

  const sessionKey = getLanguageServerSessionKey(request.folderPath, serverId);
  let session = activeLanguageServers.get(sessionKey);

  if (!session) {
    const definition = LANGUAGE_SERVER_DEFINITIONS.find(
      (candidate) => candidate.id === serverId,
    );
    if (!definition) return ready;

    const resolved = resolveLanguageServerCommand(
      definition,
      request.folderPath,
    );
    const available = await canRunCommand(resolved.command, resolved.args);
    if (!available || !resolved.startable) return ready;

    if (!warmingLanguageServerKeys.has(sessionKey)) {
      warmingLanguageServerKeys.add(sessionKey);
      void startLanguageServerDefinition(
        request.folderPath,
        definition,
      ).finally(() => warmingLanguageServerKeys.delete(sessionKey));
    }
  }

  // Definition is triggered by direct user intent: Ctrl/Cmd-click, F12, or the
  // command palette. Returning an empty location list while the server is still
  // initializing makes navigation look broken even though the same server may
  // become ready a moment later. I wait for the existing or just-started
  // session using the same bounded warm-up window as completion, then let the
  // caller decide how to report a true failure.
  session = await waitForReadyLanguageServerSession(sessionKey);
  if (!session) return ready;

  return { ok: true as const, message: "", session };
}

export function requestLanguageServer(
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

function normalizeSemanticTokensProvider(
  initializeResult: unknown,
): LanguageServerSemanticTokensProvider | null {
  if (!initializeResult || typeof initializeResult !== "object") return null;
  const capabilities = (initializeResult as { capabilities?: unknown }).capabilities;
  if (!capabilities || typeof capabilities !== "object") return null;
  const provider = (capabilities as { semanticTokensProvider?: unknown })
    .semanticTokensProvider;
  if (!provider || typeof provider !== "object") return null;

  const rawProvider = provider as {
    legend?: unknown;
    full?: unknown;
    range?: unknown;
  };
  const legend =
    rawProvider.legend && typeof rawProvider.legend === "object"
      ? (rawProvider.legend as {
          tokenTypes?: unknown;
          tokenModifiers?: unknown;
        })
      : null;
  const tokenTypes = Array.isArray(legend?.tokenTypes)
    ? legend.tokenTypes.filter((tokenType): tokenType is string => {
        return typeof tokenType === "string" && tokenType.length > 0;
      })
    : [];
  const tokenModifiers = Array.isArray(legend?.tokenModifiers)
    ? legend.tokenModifiers.filter((modifier): modifier is string => {
        return typeof modifier === "string" && modifier.length > 0;
      })
    : [];

  if (tokenTypes.length === 0) return null;

  return {
    legend: {
      tokenTypes,
      tokenModifiers,
    },
    full:
      rawProvider.full === true ||
      (Boolean(rawProvider.full) && typeof rawProvider.full === "object"),
    range: Boolean(rawProvider.range),
  };
}

function disposeLanguageServerSession(session: LanguageServerSession) {
  session.disposed = true;
  clearPendingDiagnosticsForSession(session);
  if (session.initializeRetryTimer) {
    clearTimeout(session.initializeRetryTimer);
    session.initializeRetryTimer = null;
  }
  if (session.typeScriptProjectRefreshTimer) {
    clearTimeout(session.typeScriptProjectRefreshTimer);
    session.typeScriptProjectRefreshTimer = null;
  }
}

async function registerTypeScriptProjects(session: LanguageServerSession) {
  const projectConfigs = await discoverTypeScriptProjectConfigs(
    session.folderPath,
  );
  const request = await createTypeScriptExternalProjectsRequest(projectConfigs);
  const projects = (request.arguments[1] as { projects: unknown[] }).projects;

  await requestLanguageServer(
    session,
    "workspace/executeCommand",
    request,
    15_000,
  );
  emitLanguageServerLog(
    session,
    "info",
    `Discovered ${projectConfigs.length} TypeScript project config${projectConfigs.length === 1 ? "" : "s"}; registered ${projects.length} cross-directory project${projects.length === 1 ? "" : "s"}.`,
  );
}

function scheduleTypeScriptProjectRefresh(session: LanguageServerSession) {
  if (session.disposed) return;
  if (session.typeScriptProjectRefreshTimer) {
    clearTimeout(session.typeScriptProjectRefreshTimer);
  }

  // Config writes often arrive as several watcher events from an atomic save.
  // I collapse that burst into one scan so editing tsconfig.json does not make
  // TypeScript repeatedly parse the same monorepo while the file is changing.
  session.typeScriptProjectRefreshTimer = setTimeout(() => {
    session.typeScriptProjectRefreshTimer = null;
    void registerTypeScriptProjects(session).catch((error) => {
      emitLanguageServerLog(
        session,
        "error",
        `TypeScript project refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, 250);
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
          semanticTokens: {
            dynamicRegistration: false,
            requests: {
              range: false,
              full: {
                delta: false,
              },
            },
            tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
            tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
            formats: ["relative"],
            overlappingTokenSupport: false,
            multilineTokenSupport: true,
            serverCancelSupport: true,
            augmentsSyntaxTokens: true,
          },
        },
        workspace: {
          configuration: true,
          workspaceFolders: true,
          // The folder watcher below sends didChangeWatchedFiles for files that
          // are not open in Monaco. Advertising the capability keeps language
          // servers such as gopls, tsserver, and clangd aware that Axon can
          // report external file creates/changes/deletes for workspace indexing.
          didChangeWatchedFiles: {
            dynamicRegistration: true,
          },
        },
      },
    },
    LANGUAGE_SERVER_INITIALIZE_TIMEOUT_MS,
  )
    .then(async (initializeResult) => {
      console.log("[LSP SPAWN OK]", session.id);
      if (session.disposed) return;
      session.semanticTokensProvider =
        normalizeSemanticTokensProvider(initializeResult);
      notifyLanguageServer(session, "initialized", {});
      void notifyLanguageServerConfiguration(session, notifyLanguageServer);

      if (session.id === "typescript") {
        try {
          // I finish cross-directory registration before exposing the session
          // as ready, otherwise an early completion or diagnostic request can
          // still place a sibling source file into an inferred project.
          await registerTypeScriptProjects(session);
        } catch (error) {
          emitLanguageServerLog(
            session,
            "error",
            `TypeScript project discovery failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
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

export function startLanguageServerDefinition(
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
          typeScriptProjectRefreshTimer: null,
          refreshTypeScriptProjects: null,
          stderr: "",
          stdoutBuffer: Buffer.alloc(0),
          semanticTokensProvider: null,
          pendingRequests: new Map(),
          syncedDocuments: new Map(),
        };
        if (session.id === "typescript") {
          session.refreshTypeScriptProjects = () => {
            scheduleTypeScriptProjectRefresh(session);
          };
        }

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

export function waitForReadyLanguageServerSession(
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

  const startAttempts = startableServers
    .map((status) =>
      LANGUAGE_SERVER_DEFINITIONS.find((candidate) => candidate.id === status.id),
    )
    .filter((definition): definition is LanguageServerDefinition =>
      Boolean(definition),
    )
    .map((definition) => startLanguageServerDefinition(folderPath, definition));

  attempts.push(...(await Promise.all(startAttempts)));

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
  options: { relevantOnly?: boolean; languageId?: string } = {},
): Promise<LanguageServerStatus[]> {
  const activeLanguageServerIds = new Set(
    options.languageId
      ? resolveDocumentSyncServerIds(options.languageId)
      : [],
  );
  const definitions = LANGUAGE_SERVER_DEFINITIONS.filter((definition) => {
    if (!options.relevantOnly) return true;
    const sessionKey = getLanguageServerSessionKey(folderPath, definition.id);
    return (
      activeLanguageServers.has(sessionKey) ||
      activeLanguageServerIds.has(definition.id) ||
      hasWorkspaceMarker(folderPath, definition.workspaceMarkers)
    );
  });

  return Promise.all(
    definitions.map(async (definition) => {
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
