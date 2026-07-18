import { type LanguageServerStatus } from "@axon-editor/shared/lsp";

export function normalizeLanguage(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#]/g, "");
}

export function serverMatchesLanguage(
  server: LanguageServerStatus,
  language: string,
) {
  const normalizedLanguage = normalizeLanguage(language);
  if (normalizeLanguage(server.id) === normalizedLanguage) return true;

  const aliases: Record<string, string[]> = {
    javascriptreact: ["jsx", "javascript"],
    typescriptreact: ["tsx", "typescript"],
    csharp: ["c#", "csharp"],
  };
  const candidates = new Set([
    normalizedLanguage,
    ...(aliases[normalizedLanguage] ?? []),
  ]);
  return server.languages.some((candidate) =>
    candidates.has(normalizeLanguage(candidate)),
  );
}
