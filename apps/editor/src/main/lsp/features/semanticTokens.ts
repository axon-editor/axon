import {
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS,
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES,
  type LanguageServerSemanticTokensRequest,
  type LanguageServerSemanticTokensResult,
} from "../../../shared/lsp";
import { syncLanguageServerDocument } from "../features";
import { requestLanguageServer, getReadyOrWarmLanguageServerSession } from "./lifecycle";

const axonSemanticTokenTypeIndexes = new Map<string, number>(
  LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES.map((tokenType, index) => [
    tokenType,
    index,
  ]),
);
const axonSemanticTokenModifierIndexes = new Map<string, number>(
  LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS.map((modifier, index) => [
    modifier,
    index,
  ]),
);

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

function remapTokenModifierBits(
  serverModifiers: string[],
  serverModifierBits: number,
) {
  let axonModifierBits = 0;
  for (let serverIndex = 0; serverIndex < serverModifiers.length; serverIndex += 1) {
    if ((serverModifierBits & (1 << serverIndex)) === 0) continue;
    const modifier = serverModifiers[serverIndex];
    const axonIndex = axonSemanticTokenModifierIndexes.get(modifier);
    if (axonIndex === undefined) continue;
    axonModifierBits |= 1 << axonIndex;
  }
  return axonModifierBits;
}

function remapSemanticTokenData(
  data: number[],
  serverLegend: { tokenTypes: string[]; tokenModifiers: string[] },
) {
  const variableTokenIndex =
    axonSemanticTokenTypeIndexes.get("variable") ?? 0;
  const remapped = [...data];

  for (let offset = 0; offset < remapped.length; offset += 5) {
    const serverTokenType = serverLegend.tokenTypes[remapped[offset + 3]];
    remapped[offset + 3] =
      axonSemanticTokenTypeIndexes.get(serverTokenType) ?? variableTokenIndex;
    remapped[offset + 4] = remapTokenModifierBits(
      serverLegend.tokenModifiers,
      remapped[offset + 4],
    );
  }

  return remapped;
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
        tokenTypes: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_TYPES],
        tokenModifiers: [...LANGUAGE_SERVER_SEMANTIC_TOKEN_MODIFIERS],
      },
      data: remapSemanticTokenData(normalized.data, provider.legend),
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
