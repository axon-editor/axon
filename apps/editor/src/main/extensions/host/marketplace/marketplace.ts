/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
} from "../../paths";
import { findExtensionDirectories } from "../shared/discovery";
import { readJsonFile } from "../shared/json";
import {
  normalizeExtensionContributions,
  normalizeExtensionManifest,
} from "../shared/manifest";
import { fetchRemoteRegistry, toRemoteMarketplaceItems } from "./remoteRegistry";

export interface CatalogPackage {
  manifest: NonNullable<ReturnType<typeof normalizeExtensionManifest>>;
  packagePath: string;
}

export async function readCatalogPackages(): Promise<CatalogPackage[]> {
  // The marketplace reads every package manifest on demand. Async manifest
  // loads keep a slow marketplace folder from blocking the main process while
  // listing installed themes or packages.
  const packages = await Promise.all(
    findExtensionDirectories(getMarketplaceExtensionsPath()).map(
      async (packagePath) => {
        const manifest = normalizeExtensionManifest(
          await readJsonFile(path.join(packagePath, EXTENSION_MANIFEST_FILE)),
        );
        if (!manifest?.contributes) return null;
        return { manifest, packagePath };
      },
    ),
  );
  return packages.filter((entry): entry is CatalogPackage => entry !== null);
}

async function createInstalledIdSet() {
  const userExtensionsPath = getUserExtensionsPath();
  const installedManifests = await Promise.all(
    findExtensionDirectories(userExtensionsPath).map(async (packagePath) => {
      const manifest = normalizeExtensionManifest(
        await readJsonFile(path.join(packagePath, EXTENSION_MANIFEST_FILE)),
      );
      return manifest ? manifest.id : null;
    }),
  );
  return new Set(installedManifests.filter((id): id is string => id !== null));
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
    ["index providers", contributes.workspaceIndexProviders.length],
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
    // Bundled packages are readable from disk, so they never need a registry
    // copy. The Downloads view falls back to the local read on install.
    readme: null,
  };
}

export async function getExtensionMarketplaceState(): Promise<ExtensionMarketplaceState> {
  const [installedIds, catalogPackages] = await Promise.all([
    createInstalledIdSet(),
    readCatalogPackages(),
  ]);

  const items = catalogPackages.map((catalogPackage) =>
    toMarketplaceItem(catalogPackage, installedIds),
  );

  // The hosted registry is best-effort: a staging server, an offline laptop,
  // or a moved repository must never hide the bundled marketplace, which stays
  // installable offline. A failed fetch becomes a remoteError warning on the
  // Downloads view instead of failing the whole marketplace.
  let remoteError: string | null = null;
  try {
    const index = await fetchRemoteRegistry();
    const localItemIds = new Set(items.map((item) => item.id));
    for (const remoteItem of toRemoteMarketplaceItems(index, installedIds)) {
      if (!localItemIds.has(remoteItem.id)) items.push(remoteItem);
    }
  } catch (err) {
    remoteError =
      err instanceof Error ? err.message : "The extension registry is unreachable.";
  }

  return { items, remoteError };
}
