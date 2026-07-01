import {
  type ExtensionContributions,
  type ExtensionKind,
  type ExtensionManifest,
} from "./manifest";

export function isExtensionKind(value: unknown): value is ExtensionKind {
  return (
    value === "theme" ||
    value === "icon-theme" ||
    value === "language" ||
    value === "tool" ||
    value === "view" ||
    value === "agent" ||
    value === "terminal" ||
    value === "mixed"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getExtensionRepositoryUrl(
  repository: ExtensionManifest["repository"],
) {
  if (typeof repository === "string") return repository;
  return typeof repository?.url === "string" ? repository.url : null;
}

export function emptyExtensionContributions(): Required<ExtensionContributions> {
  return {
    commands: [],
    themes: [],
    iconThemes: [],
    icons: [],
    languages: [],
    snippets: [],
    views: [],
    agents: [],
    terminalProfiles: [],
    taskProviders: [],
    debuggerProviders: [],
    languagePacks: [],
  };
}

export function inferExtensionKind(
  manifest: Pick<ExtensionManifest, "kind">,
  contributes: Required<ExtensionContributions>,
): ExtensionKind {
  if (manifest.kind) return manifest.kind;

  const kinds = new Set<ExtensionKind>();
  if (contributes.themes.length > 0) kinds.add("theme");
  if (contributes.iconThemes.length > 0 || contributes.icons.length > 0) {
    kinds.add("icon-theme");
  }
  if (contributes.languages.length > 0 || contributes.snippets.length > 0) {
    kinds.add("language");
  }
  if (contributes.views.length > 0) kinds.add("view");
  if (contributes.agents.length > 0) kinds.add("agent");
  if (contributes.terminalProfiles.length > 0) kinds.add("terminal");
  if (
    contributes.commands.length > 0 ||
    contributes.taskProviders.length > 0 ||
    contributes.debuggerProviders.length > 0
  ) {
    kinds.add("tool");
  }

  return kinds.size === 1 ? [...kinds][0] : kinds.size > 1 ? "mixed" : "tool";
}
