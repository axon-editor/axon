import fs from "fs";
import path from "path";
import {
  type ExtensionActionResult,
  type ExtensionContributions,
  type ExtensionInfo,
  type ExtensionManifest,
  type ExtensionState,
} from "../../shared/extensions";
import {
  EXTENSION_MANIFEST_FILE,
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
    languages: [],
    snippets: [],
    icons: [],
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
  return {
    commands: Array.isArray(contributes?.commands) ? contributes.commands : [],
    themes: Array.isArray(contributes?.themes) ? contributes.themes : [],
    languages: Array.isArray(contributes?.languages) ? contributes.languages : [],
    snippets: Array.isArray(contributes?.snippets) ? contributes.snippets : [],
    icons: Array.isArray(contributes?.icons) ? contributes.icons : [],
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

function findExtensionDirectories(rootPath: string | null) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootPath, entry.name))
    .filter((extensionPath) =>
      fs.existsSync(path.join(extensionPath, EXTENSION_MANIFEST_FILE)),
    );
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
    source,
    path: extensionPath,
    enabled,
    builtin: source === "internal",
    categories: manifest.categories ?? [],
    activationEvents: manifest.activationEvents ?? [],
    contributes,
    themes,
    errors,
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
    source: "internal",
    path: "app://axon/builtin",
    enabled: true,
    builtin: true,
    categories: ["Themes", "Icons", "Languages", "Snippets"],
    activationEvents: ["onStartup"],
    contributes: emptyContributions(),
    themes: [],
    errors: [],
  };
}

export function getExtensionState(folderPath?: string | null): ExtensionState {
  const userExtensionsPath = getUserExtensionsPath();
  const workspaceExtensionsPath = getWorkspaceExtensionsPath(folderPath);
  fs.mkdirSync(userExtensionsPath, { recursive: true });

  const disabledIds = new Set(readEnablementState().disabled);
  const workspaceExtensions = findExtensionDirectories(workspaceExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "workspace", disabledIds),
  );
  const userExtensions = findExtensionDirectories(userExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "user", disabledIds),
  );

  return {
    extensions: [
      createInternalExtension(),
      ...workspaceExtensions,
      ...userExtensions,
    ].filter((extension): extension is ExtensionInfo => extension !== null),
    userExtensionsPath,
    workspaceExtensionsPath,
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
