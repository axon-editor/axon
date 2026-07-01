import path from "path";
import {
  getExtensionRepositoryUrl,
  inferExtensionKind,
  type ExtensionMarketplaceItem,
  type ExtensionMarketplaceState,
} from "@axon/extension-api";
import {
  EXTENSION_MANIFEST_FILE,
  getMarketplaceExtensionsPath,
  getUserExtensionsPath,
} from "../paths";
import { findExtensionDirectories } from "./discovery";
import { readJsonFile } from "./json";
import {
  normalizeExtensionContributions,
  normalizeExtensionManifest,
} from "./manifest";

export interface CatalogPackage {
  manifest: NonNullable<ReturnType<typeof normalizeExtensionManifest>>;
  packagePath: string;
}

export function readCatalogPackages(): CatalogPackage[] {
  return findExtensionDirectories(getMarketplaceExtensionsPath()).flatMap(
    (packagePath) => {
      const manifest = normalizeExtensionManifest(
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
    findExtensionDirectories(userExtensionsPath).flatMap((packagePath) => {
      const manifest = normalizeExtensionManifest(
        readJsonFile(path.join(packagePath, EXTENSION_MANIFEST_FILE)),
      );
      return manifest ? [manifest.id] : [];
    }),
  );
}

function createContributionLabels(
  contributes: ReturnType<typeof normalizeExtensionContributions>,
) {
  return [
    ["themes", contributes.themes.length],
    ["icon themes", contributes.iconThemes.length],
    ["icons", contributes.icons.length],
    ["languages", contributes.languages.length],
    ["snippets", contributes.snippets.length],
    ["commands", contributes.commands.length],
    ["views", contributes.views.length],
    ["agents", contributes.agents.length],
    ["terminal profiles", contributes.terminalProfiles.length],
    ["tasks", contributes.taskProviders.length],
    ["debuggers", contributes.debuggerProviders.length],
  ].flatMap(([label, count]) => (Number(count) > 0 ? [`${count} ${label}`] : []));
}

export function toMarketplaceItem(
  catalogPackage: CatalogPackage,
  installedIds: Set<string>,
): ExtensionMarketplaceItem {
  const { manifest } = catalogPackage;
  const contributes = normalizeExtensionContributions(manifest.contributes);

  return {
    id: manifest.id,
    name: manifest.name,
    publisher: manifest.publisher,
    version: manifest.version,
    description: manifest.description ?? "",
    repositoryUrl: getExtensionRepositoryUrl(manifest.repository),
    homepageUrl: manifest.homepage ?? null,
    categories: manifest.categories ?? [],
    kind: inferExtensionKind(manifest, contributes),
    themes: contributes.themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
    })),
    contributionLabels: createContributionLabels(contributes),
    installed: installedIds.has(manifest.id),
  };
}

export function getExtensionMarketplaceState(): ExtensionMarketplaceState {
  const installedIds = createInstalledIdSet();
  return {
    items: readCatalogPackages().map((catalogPackage) =>
      toMarketplaceItem(catalogPackage, installedIds),
    ),
  };
}
