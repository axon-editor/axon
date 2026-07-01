import fs from "fs";
import path from "path";
import {
  type ExtensionActionResult,
  type ExtensionContributions,
  type ExtensionInfo,
  type ExtensionKind,
  type ExtensionManifest,
  type ExtensionState,
} from "../../shared/extensions";
import {
  EXTENSION_MANIFEST_FILE,
  getBundledExtensionsPath,
  getExtensionStatePath,
  getUserExtensionsPath,
  getWorkspaceExtensionsPath,
  resolveExtensionPath,
} from "./paths";
import { readExtensionTheme } from "./themeNormalizer";

interface ExtensionEnablementState {
  disabled: string[];
}

function emptyContributions(): Required<ExtensionContributions> {
  return {
    commands: [],
    themes: [],
    iconThemes: [],
    languages: [],
    snippets: [],
    icons: [],
    views: [],
    agents: [],
    terminalProfiles: [],
    taskProviders: [],
    debuggerProviders: [],
    languagePacks: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readEnablementState(): ExtensionEnablementState {
  const state = readJsonFile<ExtensionEnablementState>(getExtensionStatePath());
  return {
    disabled: Array.isArray(state?.disabled)
      ? state.disabled.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function writeEnablementState(state: ExtensionEnablementState) {
  fs.mkdirSync(path.dirname(getExtensionStatePath()), { recursive: true });
  fs.writeFileSync(getExtensionStatePath(), JSON.stringify(state, null, 2));
}

function normalizeContributions(
  contributes: ExtensionManifest["contributes"],
): Required<ExtensionContributions> {
  // Manifests come from local folders and future downloaded packages, so this
  // normalization is the loader's trust boundary. Every contribution point gets
  // an array even when the manifest omits it, which lets the renderer and
  // marketplace count features without defensive optional checks everywhere.
  return {
    commands: Array.isArray(contributes?.commands) ? contributes.commands : [],
    themes: Array.isArray(contributes?.themes) ? contributes.themes : [],
    iconThemes: Array.isArray(contributes?.iconThemes)
      ? contributes.iconThemes
      : [],
    languages: Array.isArray(contributes?.languages) ? contributes.languages : [],
    snippets: Array.isArray(contributes?.snippets) ? contributes.snippets : [],
    icons: Array.isArray(contributes?.icons) ? contributes.icons : [],
    views: Array.isArray(contributes?.views) ? contributes.views : [],
    agents: Array.isArray(contributes?.agents) ? contributes.agents : [],
    terminalProfiles: Array.isArray(contributes?.terminalProfiles)
      ? contributes.terminalProfiles
      : [],
    taskProviders: Array.isArray(contributes?.taskProviders)
      ? contributes.taskProviders
      : [],
    debuggerProviders: Array.isArray(contributes?.debuggerProviders)
      ? contributes.debuggerProviders
      : [],
    languagePacks: Array.isArray(contributes?.languagePacks)
      ? contributes.languagePacks
      : [],
  };
}

function normalizeManifest(raw: unknown): ExtensionManifest | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.publisher !== "string" ||
    typeof raw.version !== "string"
  ) {
    return null;
  }

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
    activationEvents: Array.isArray(raw.activationEvents)
      ? raw.activationEvents.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    contributes: isRecord(raw.contributes)
      ? (raw.contributes as ExtensionContributions)
      : {},
  };
}

function isExtensionKind(value: unknown): value is ExtensionKind {
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

function getRepositoryUrl(repository: ExtensionManifest["repository"]) {
  if (typeof repository === "string") return repository;
  return typeof repository?.url === "string" ? repository.url : null;
}

function inferExtensionKind(
  manifest: ExtensionManifest,
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

function findExtensionDirectories(rootPath: string | null) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];

  const extensionDirectories: string[] = [];
  const visit = (currentPath: string) => {
    const manifestPath = path.join(currentPath, EXTENSION_MANIFEST_FILE);
    if (fs.existsSync(manifestPath)) {
      extensionDirectories.push(currentPath);
      return;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      visit(path.join(currentPath, entry.name));
    }
  };

  // Built-in extensions are now grouped by category, for example
  // extensions/builtin/themes/* and extensions/builtin/icons/*. User and
  // workspace extensions can still live directly under their extension root.
  // Recursing until a manifest is found lets both layouts work while avoiding
  // accidental nested extension ownership below a real package.
  visit(rootPath);
  return extensionDirectories;
}

function loadExtensionFromPath(
  extensionPath: string,
  source: ExtensionInfo["source"],
  disabledIds: Set<string>,
): ExtensionInfo | null {
  const errors: string[] = [];
  const manifestPath = path.join(extensionPath, EXTENSION_MANIFEST_FILE);
  const manifest = normalizeManifest(readJsonFile<unknown>(manifestPath));
  if (!manifest) return null;

  const contributes = normalizeContributions(manifest.contributes);
  const enabled = !disabledIds.has(manifest.id);
  const themes = enabled
    ? contributes.themes.flatMap((theme) => {
        try {
          return readExtensionTheme(
            manifest.id,
            manifest.name,
            theme.id,
            theme.label,
            resolveExtensionPath(extensionPath, theme.path),
          );
        } catch (err) {
          errors.push(
            `${theme.label}: ${err instanceof Error ? err.message : "failed to load theme"}`,
          );
          return [];
        }
      })
    : [];

  return {
    id: manifest.id,
    name: manifest.name,
    publisher: manifest.publisher,
    version: manifest.version,
    description: manifest.description ?? "",
    repositoryUrl: getRepositoryUrl(manifest.repository),
    homepageUrl: manifest.homepage ?? null,
    kind: inferExtensionKind(manifest, contributes),
    source,
    path: extensionPath,
    enabled,
    builtin: source === "internal",
    categories: manifest.categories ?? [],
    activationEvents: manifest.activationEvents ?? [],
    contributes,
    themes,
    errors,
    active: enabled && errors.length === 0,
    activationReason:
      enabled && (manifest.activationEvents?.length ?? 0) > 0
        ? manifest.activationEvents?.[0] ?? "onStartup"
        : enabled
          ? "declarative"
          : "disabled",
    hostKind: "declarative",
    lifecycle: !enabled ? "disabled" : errors.length > 0 ? "error" : "active",
  };
}

function createInternalExtension(): ExtensionInfo {
  return {
    id: "axon.builtin",
    name: "Axon Built-ins",
    publisher: "Axon",
    version: "1.0.0",
    description:
      "Built-in themes, file icons, language metadata, snippets, and commands that ship with Axon.",
    repositoryUrl: null,
    homepageUrl: null,
    kind: "mixed",
    source: "internal",
    path: "app://axon/builtin",
    enabled: true,
    builtin: true,
    categories: ["Themes", "Icons", "Languages", "Snippets"],
    activationEvents: ["onStartup"],
    contributes: emptyContributions(),
    themes: [],
    errors: [],
    active: true,
    activationReason: "onStartup",
    hostKind: "declarative",
    lifecycle: "active",
  };
}

export function getExtensionState(folderPath?: string | null): ExtensionState {
  const bundledExtensionsPath = getBundledExtensionsPath();
  const userExtensionsPath = getUserExtensionsPath();
  const workspaceExtensionsPath = getWorkspaceExtensionsPath(folderPath);
  fs.mkdirSync(userExtensionsPath, { recursive: true });

  const disabledIds = new Set(readEnablementState().disabled);
  const bundledExtensions = findExtensionDirectories(bundledExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "internal", disabledIds),
  );
  const workspaceExtensions = findExtensionDirectories(workspaceExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "workspace", disabledIds),
  );
  const userExtensions = findExtensionDirectories(userExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "user", disabledIds),
  );

  return {
    extensions: [
      createInternalExtension(),
      ...bundledExtensions,
      ...workspaceExtensions,
      ...userExtensions,
    ].filter((extension): extension is ExtensionInfo => extension !== null),
    userExtensionsPath,
    workspaceExtensionsPath,
    hostStatus: {
      mode: "declarative",
      safeMode: true,
      message:
        "Extensions are loaded as declarative manifests. Axon has not enabled arbitrary extension code execution in the renderer.",
    },
    availableActivationEvents: [
      "onStartup",
      "onCommand",
      "onLanguage",
      "onWorkspaceContains",
      "onView",
      "onAgent",
      "onTerminalProfile",
      "onTaskType",
      "onDebugType",
    ],
  };
}

export function setExtensionEnabled(
  extensionId: string,
  enabled: boolean,
  folderPath?: string | null,
): ExtensionActionResult {
  const state = readEnablementState();
  const disabled = new Set(state.disabled);
  if (enabled) {
    disabled.delete(extensionId);
  } else {
    disabled.add(extensionId);
  }
  writeEnablementState({ disabled: Array.from(disabled).sort() });

  return {
    ok: true,
    message: `${enabled ? "Enabled" : "Disabled"} ${extensionId}.`,
    state: getExtensionState(folderPath),
  };
}
