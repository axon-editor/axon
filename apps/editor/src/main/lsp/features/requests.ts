import {
  type LanguageServerCodeAction,
  type LanguageServerCodeActionRequest,
  type LanguageServerCodeActionResult,
  type LanguageServerCommand,
  type LanguageServerCompletionRequest,
  type LanguageServerCompletionResult,
  type LanguageServerDefinitionRequest,
  type LanguageServerDefinitionResult,
  type LanguageServerExecuteCommandRequest,
  type LanguageServerExecuteCommandResult,
  type LanguageServerFormatRequest,
  type LanguageServerFormatResult,
  type LanguageServerHoverRequest,
  type LanguageServerHoverResult,
  type LanguageServerReferencesRequest,
  type LanguageServerReferencesResult,
  type LanguageServerRenameRequest,
  type LanguageServerRenameResult,
  type LanguageServerSignature,
  type LanguageServerSignatureHelpRequest,
  type LanguageServerSignatureHelpResult,
} from "../../../shared/lsp";
import { normalizeLanguageServerCompletionItems } from "../completionItems";
import { LANGUAGE_SERVER_DEFINITIONS } from "../definitions";
import { formatWithBundledPrettier } from "../formatting";
import {
  canRunCommand,
  getLanguageServerSessionKey,
  resolveLanguageServerCommand,
  type LanguageServerSession,
} from "../session";
import {
  activeLanguageServers,
  normalizeHoverResult,
  normalizeLanguageServerLocations,
  normalizeLanguageServerTextEdits,
  normalizeWorkspaceEdit,
  resolveDocumentSyncServerIds,
  resolveLanguageServerIdForMonacoLanguage,
  syncLanguageServerDocument,
  warmingLanguageServerKeys,
} from "../features";
import {
  getReadyLanguageServerSession,
  getReadyOrWarmLanguageServerSession,
  requestLanguageServer,
  startLanguageServerDefinition,
  waitForReadyLanguageServerSession,
} from "./lifecycle";

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
  const resolveLimit = 160;
  const resolveConcurrency = 16;
  const resolveBudgetMs = 900;
  const startedAt = Date.now();
  const resolvedItems = [...items];
  const itemsToResolve = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.data)
    .slice(0, resolveLimit);

  let nextItemIndex = 0;
  async function resolveWorker() {
    while (nextItemIndex < itemsToResolve.length) {
      if (Date.now() - startedAt > resolveBudgetMs) return;
      const { item, index } = itemsToResolve[nextItemIndex++];
      try {
        const resolved = await requestLanguageServer(
          session,
          "completionItem/resolve",
          item,
          900,
        );
        const normalized = normalizeLanguageServerCompletionItems([resolved]);
        resolvedItems[index] = normalized[0] ?? item;
      } catch {
        // TypeScript keeps the expensive auto-import data behind
        // completionItem/resolve so the initial suggest list can stay fast.
        // If an individual resolve request times out or fails, I keep the
        // original item instead of failing the whole autocomplete request.
        // That gives the user every completion the server returned while still
        // enriching as many package/local export items as possible with the
        // additionalTextEdits that insert the import statement.
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(resolveConcurrency, itemsToResolve.length) },
      () => resolveWorker(),
    ),
  );

  return resolvedItems;
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
  const ready = await getReadyOrWarmLanguageServerSession(request);
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
