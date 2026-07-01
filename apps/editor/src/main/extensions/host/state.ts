import fs from "fs";
import path from "path";
import {
  emptyExtensionContributions,
  getExtensionRepositoryUrl,
  type ExtensionInfo,
  type ExtensionManifest,
  type ExtensionState,
} from "@axon/extension-api";
import {
  EXTENSION_MANIFEST_FILE,
  getBundledExtensionsPath,
  getUserExtensionsPath,
  getWorkspaceExtensionsPath,
  resolveExtensionPath,
} from "../paths";
import { readExtensionTheme } from "../themeNormalizer";
import {
  AVAILABLE_EXTENSION_ACTIVATION_EVENTS,
  getExtensionActivationReason,
  getExtensionHostKind,
  getExtensionLifecycle,
} from "./activation";
import { findExtensionDirectories } from "./discovery";
import { readDisabledExtensionIds } from "./enablement";
import { readJsonFile } from "./json";
import {
  inferExtensionKind,
  normalizeExtensionContributions,
  normalizeExtensionManifest,
} from "./manifest";
import { summarizeExtensionRuntime } from "./runtime";

function readThemes(
  extensionPath: string,
  manifest: ExtensionManifest,
  contributes: ReturnType<typeof normalizeExtensionContributions>,
  enabled: boolean,
  errors: string[],
) {
  if (!enabled) return [];

  return contributes.themes.flatMap((theme) => {
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
  });
}

export function loadExtensionFromPath(
  extensionPath: string,
  source: ExtensionInfo["source"],
  disabledIds: Set<string>,
): ExtensionInfo | null {
  const errors: string[] = [];
  const manifestPath = path.join(extensionPath, EXTENSION_MANIFEST_FILE);
  const manifest = normalizeExtensionManifest(readJsonFile<unknown>(manifestPath));
  if (!manifest) return null;

  const contributes = normalizeExtensionContributions(manifest.contributes);
  const enabled = !disabledIds.has(manifest.id);
  const themes = readThemes(extensionPath, manifest, contributes, enabled, errors);

  return {
    id: manifest.id,
    name: manifest.name,
    publisher: manifest.publisher,
    version: manifest.version,
    description: manifest.description ?? "",
    repositoryUrl: getExtensionRepositoryUrl(manifest.repository),
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
    activationReason: getExtensionActivationReason(manifest, enabled),
    hostKind: getExtensionHostKind(manifest),
    lifecycle: getExtensionLifecycle(enabled, errors),
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
    contributes: emptyExtensionContributions(),
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

  const disabledIds = new Set(readDisabledExtensionIds());
  const bundledExtensions = findExtensionDirectories(bundledExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "internal", disabledIds),
  );
  const workspaceExtensions = findExtensionDirectories(workspaceExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "workspace", disabledIds),
  );
  const userExtensions = findExtensionDirectories(userExtensionsPath).map(
    (extensionPath) => loadExtensionFromPath(extensionPath, "user", disabledIds),
  );

  const extensions = [
    createInternalExtension(),
    ...bundledExtensions,
    ...workspaceExtensions,
    ...userExtensions,
  ].filter((extension): extension is ExtensionInfo => extension !== null);
  const runtime = summarizeExtensionRuntime(extensions);

  return {
    extensions,
    userExtensionsPath,
    workspaceExtensionsPath,
    hostStatus: {
      mode: runtime.mode,
      safeMode: true,
      message: runtime.message,
    },
    availableActivationEvents: AVAILABLE_EXTENSION_ACTIVATION_EVENTS,
  };
}
