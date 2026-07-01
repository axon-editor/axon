import fs from "fs";
import path from "path";
import {
  type ExtensionActionResult,
  type ExtensionKind,
  type ExtensionManifest,
  type ExtensionMarketplaceItem,
  type ExtensionMarketplaceState,
} from "../../shared/extensions";
import {
  EXTENSION_MANIFEST_FILE,
  getMarketplaceExtensionsPath,
  getUserExtensionsPath,
} from "./paths";
import { getExtensionState } from "./loader";

interface CatalogPackage {
  manifest: ExtensionManifest;
  packagePath: string;
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

function findManifestDirectories(rootPath: string) {
  if (!fs.existsSync(rootPath)) return [];

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

  visit(rootPath);
  return extensionDirectories;
}

function normalizeCatalogManifest(raw: unknown): ExtensionManifest | null {
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
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((item): item is string => typeof item === "string")
      : [],
    activationEvents: Array.isArray(raw.activationEvents)
      ? raw.activationEvents.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    contributes: isRecord(raw.contributes)
      ? (raw.contributes as ExtensionManifest["contributes"])
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
    value === "mixed"
  );
}

function getRepositoryUrl(repository: ExtensionManifest["repository"]) {
  if (typeof repository === "string") return repository;
  return typeof repository?.url === "string" ? repository.url : null;
}

function readCatalogPackages(): CatalogPackage[] {
  return findManifestDirectories(getMarketplaceExtensionsPath()).flatMap(
    (packagePath) => {
      const manifest = normalizeCatalogManifest(
        readJsonFile(path.join(packagePath, EXTENSION_MANIFEST_FILE)),
      );
      if (!manifest?.contributes) return [];

      return [{ manifest, packagePath }];
    },
  );
}

function createInstalledIdSet() {
  const userExtensionsPath = getUserExtensionsPath();
  return new Set(
    findManifestDirectories(userExtensionsPath).flatMap((packagePath) => {
      const manifest = normalizeCatalogManifest(
        readJsonFile(path.join(packagePath, EXTENSION_MANIFEST_FILE)),
      );
      return manifest ? [manifest.id] : [];
    }),
  );
}

function toMarketplaceItem(
  catalogPackage: CatalogPackage,
  installedIds: Set<string>,
): ExtensionMarketplaceItem {
  const { manifest } = catalogPackage;
  const contributes = manifest.contributes ?? {};
  const contributionLabels = [
    ["themes", contributes.themes?.length ?? 0],
    ["icons", contributes.icons?.length ?? 0],
    ["languages", contributes.languages?.length ?? 0],
    ["snippets", contributes.snippets?.length ?? 0],
    ["commands", contributes.commands?.length ?? 0],
    ["views", contributes.views?.length ?? 0],
    ["tasks", contributes.taskProviders?.length ?? 0],
    ["debuggers", contributes.debuggerProviders?.length ?? 0],
  ].flatMap(([label, count]) => (Number(count) > 0 ? [`${count} ${label}`] : []));

  return {
    id: manifest.id,
    name: manifest.name,
    publisher: manifest.publisher,
    version: manifest.version,
    description: manifest.description ?? "",
    repositoryUrl: getRepositoryUrl(manifest.repository),
    homepageUrl: manifest.homepage ?? null,
    categories: manifest.categories ?? [],
    kind: manifest.kind ?? inferCatalogKind(manifest),
    themes: (contributes.themes ?? []).map((theme) => ({
      id: theme.id,
      label: theme.label,
    })),
    contributionLabels,
    installed: installedIds.has(manifest.id),
  };
}

function inferCatalogKind(manifest: ExtensionManifest): ExtensionKind {
  const contributes = manifest.contributes ?? {};
  const kinds = new Set<ExtensionKind>();
  if ((contributes.themes?.length ?? 0) > 0) kinds.add("theme");
  if ((contributes.icons?.length ?? 0) > 0) kinds.add("icon-theme");
  if (
    (contributes.languages?.length ?? 0) > 0 ||
    (contributes.snippets?.length ?? 0) > 0
  ) {
    kinds.add("language");
  }
  if ((contributes.views?.length ?? 0) > 0) kinds.add("view");
  if (
    (contributes.commands?.length ?? 0) > 0 ||
    (contributes.taskProviders?.length ?? 0) > 0 ||
    (contributes.debuggerProviders?.length ?? 0) > 0
  ) {
    kinds.add("tool");
  }

  return kinds.size === 1 ? [...kinds][0] : kinds.size > 1 ? "mixed" : "tool";
}

export function getExtensionMarketplaceState(): ExtensionMarketplaceState {
  const installedIds = createInstalledIdSet();
  return {
    items: readCatalogPackages().map((catalogPackage) =>
      toMarketplaceItem(catalogPackage, installedIds),
    ),
  };
}

export const getThemeMarketplaceState = getExtensionMarketplaceState;

function getCatalogPackage(extensionId: string) {
  return readCatalogPackages().find(
    (catalogPackage) => catalogPackage.manifest.id === extensionId,
  );
}

function sanitizePackageFolderName(extensionId: string) {
  return extensionId.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function installExtensionPackage(
  extensionId: string,
  folderPath?: string | null,
): ExtensionActionResult {
  const catalogPackage = getCatalogPackage(extensionId);
  if (!catalogPackage) {
    return {
      ok: false,
      message: `Extension package "${extensionId}" was not found in the Axon extension registry.`,
      state: getExtensionState(folderPath),
    };
  }

  const userExtensionsPath = getUserExtensionsPath();
  const destinationPath = path.join(
    userExtensionsPath,
    sanitizePackageFolderName(catalogPackage.manifest.id),
  );

  if (fs.existsSync(destinationPath)) {
    return {
      ok: true,
      message: `${catalogPackage.manifest.name} is already installed.`,
      state: getExtensionState(folderPath),
    };
  }

  fs.mkdirSync(userExtensionsPath, { recursive: true });

  // Downloaded themes are installed by copying a complete extension package
  // into the user extension directory. Keeping the manifest and theme JSON
  // together means reload uses the exact same loader path as manually installed
  // extensions, so marketplace installs do not need a parallel theme registry.
  fs.cpSync(catalogPackage.packagePath, destinationPath, {
    recursive: true,
    errorOnExist: true,
  });

  return {
    ok: true,
    message: `Installed ${catalogPackage.manifest.name}.`,
    state: getExtensionState(folderPath),
  };
}

export const installThemeExtension = installExtensionPackage;
