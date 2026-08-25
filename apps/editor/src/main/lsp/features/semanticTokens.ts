import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
  type LanguageServerSemanticTokensRequest,
  type LanguageServerSemanticTokensResult,
} from "../../../shared/lsp";
import { syncLanguageServerDocument } from "../features";
import {
  requestLanguageServer,
  getReadyOrWarmLanguageServerSession,
} from "./lifecycle";

const loggedSemanticTokenLegends = new Set<string>();

function normalizeSemanticTokenData(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const rawResult = result as {
    data?: unknown;
    resultId?: unknown;
  };
  if (!Array.isArray(rawResult.data)) return null;

  const data = rawResult.data.filter((entry): entry is number => {
    return Number.isInteger(entry) && entry >= 0;
  });
  if (data.length % 5 !== 0) return null;

  return {
    data,
    resultId:
      typeof rawResult.resultId === "string" ? rawResult.resultId : undefined,
  };
}

export async function getLanguageServerSemanticTokens(
  request: LanguageServerSemanticTokensRequest,
): Promise<LanguageServerSemanticTokensResult> {
  const ready = await getReadyOrWarmLanguageServerSession(request);
  if (!ready.ok || !ready.session) {
    return {
      ok: false,
      message: ready.message,
      legend: {
        tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
        tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
      },
      data: [],
    };
  }

  const provider = ready.session.semanticTokensProvider;
  if (!provider?.full) {
    return {
      ok: true,
      serverId: ready.session.id,
      legend: {
        tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
        tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
      },
      data: [],
    };
  }

  if (!loggedSemanticTokenLegends.has(ready.session.id)) {
    loggedSemanticTokenLegends.add(ready.session.id);
    console.info("[LSP SEMANTIC LEGEND]", ready.session.id, {
      tokenTypes: provider.legend.tokenTypes,
      tokenModifiers: provider.legend.tokenModifiers,
    });
  }

  try {
    const uri = syncLanguageServerDocument(ready.session, request);
    const result = await requestLanguageServer(
      ready.session,
      "textDocument/semanticTokens/full",
      {
        textDocument: { uri },
      },
      12_000,
    );
    const normalized = normalizeSemanticTokenData(result);
    if (!normalized) {
      return {
        ok: true,
        serverId: ready.session.id,
        legend: {
          tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
          tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
        },
        data: [],
      };
    }

    // LSP semantic token data stores token type and modifier indexes against
    // the server's own legend. Monaco's provider gets one fixed legend per
    // language, so I translate those indexes into Axon's canonical legend here.
    // Without this step, switching between TypeScript, gopls, rust-analyzer,
    // and Pyright would make the same numeric token index mean different
    // things, which is exactly the kind of unstable coloring that makes an
    // editor feel random.
    return {
      ok: true,
      serverId: ready.session.id,
      legend: {
        tokenTypes: [...provider.legend.tokenTypes],
        tokenModifiers: [...provider.legend.tokenModifiers],
      },
      data: normalized.data,
      resultId: normalized.resultId,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Semantic token request failed.",
      serverId: ready.session.id,
      legend: {
        tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
        tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
      },
      data: [],
    };
  }
}
