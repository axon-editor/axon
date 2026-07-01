import {
  emptyExtensionContributions,
  inferExtensionKind,
  isExtensionKind,
  isRecord,
  type ExtensionContributions,
  type ExtensionManifest,
} from "@axon/extension-api";

export function normalizeExtensionContributions(
  contributes: ExtensionManifest["contributes"],
): Required<ExtensionContributions> {
  const empty = emptyExtensionContributions();

  // Manifest JSON is the first untrusted boundary for every installed package.
  // Returning arrays for every known contribution point lets the rest of the
  // host treat extension metadata as normalized data instead of repeating
  // optional checks in marketplace, state assembly, activation, and future
  // contribution registries.
  return {
    commands: Array.isArray(contributes?.commands) ? contributes.commands : empty.commands,
    themes: Array.isArray(contributes?.themes) ? contributes.themes : empty.themes,
    iconThemes: Array.isArray(contributes?.iconThemes)
      ? contributes.iconThemes
      : empty.iconThemes,
    icons: Array.isArray(contributes?.icons) ? contributes.icons : empty.icons,
    languages: Array.isArray(contributes?.languages)
      ? contributes.languages
      : empty.languages,
    snippets: Array.isArray(contributes?.snippets)
      ? contributes.snippets
      : empty.snippets,
    views: Array.isArray(contributes?.views) ? contributes.views : empty.views,
    agents: Array.isArray(contributes?.agents) ? contributes.agents : empty.agents,
    terminalProfiles: Array.isArray(contributes?.terminalProfiles)
      ? contributes.terminalProfiles
      : empty.terminalProfiles,
    taskProviders: Array.isArray(contributes?.taskProviders)
      ? contributes.taskProviders
      : empty.taskProviders,
    debuggerProviders: Array.isArray(contributes?.debuggerProviders)
      ? contributes.debuggerProviders
      : empty.debuggerProviders,
    languagePacks: Array.isArray(contributes?.languagePacks)
      ? contributes.languagePacks
      : empty.languagePacks,
  };
}

export function normalizeExtensionManifest(raw: unknown): ExtensionManifest | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.publisher !== "string" ||
    typeof raw.version !== "string"
  ) {
    return null;
  }

  // Activation events are template-literal typed in the public API so authors
  // get useful autocomplete. Runtime JSON cannot prove that shape, so the host
  // filters to strings at this boundary and then narrows the value for the rest
  // of the extension pipeline.
  const activationEvents = (
    Array.isArray(raw.activationEvents)
      ? raw.activationEvents.filter(
          (item): item is string => typeof item === "string",
        )
      : []
  ) as NonNullable<ExtensionManifest["activationEvents"]>;

  return {
    $schema: typeof raw.$schema === "string" ? raw.$schema : undefined,
    id: raw.id,
    name: raw.name,
    publisher: raw.publisher,
    version: raw.version,
    description:
      typeof raw.description === "string" ? raw.description : undefined,
    repository:
      typeof raw.repository === "string" || isRecord(raw.repository)
        ? (raw.repository as ExtensionManifest["repository"])
        : undefined,
    homepage: typeof raw.homepage === "string" ? raw.homepage : undefined,
    kind: isExtensionKind(raw.kind) ? raw.kind : undefined,
    author:
      typeof raw.author === "string" || isRecord(raw.author)
        ? (raw.author as ExtensionManifest["author"])
        : undefined,
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((item): item is string => typeof item === "string")
      : [],
    activationEvents,
    main: typeof raw.main === "string" ? raw.main : undefined,
    contributes: isRecord(raw.contributes)
      ? (raw.contributes as ExtensionContributions)
      : {},
  };
}

export { inferExtensionKind };
