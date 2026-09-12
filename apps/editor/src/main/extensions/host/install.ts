import fs from "fs";
import path from "path";
import { type ExtensionActionResult } from "@axon/extension-api";
import { getUserExtensionsPath } from "../paths";
import { getExtensionState, invalidateExtensionStateCache } from "./state";
import { readCatalogPackages } from "./marketplace";

async function getCatalogPackage(extensionId: string) {
  const catalogPackages = await readCatalogPackages();
  return catalogPackages.find(
    (catalogPackage) => catalogPackage.manifest.id === extensionId,
  );
}

function sanitizePackageFolderName(extensionId: string) {
  return extensionId.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function installExtensionPackage(
  extensionId: string,
  folderPath?: string | null,
): Promise<ExtensionActionResult> {
  const catalogPackage = await getCatalogPackage(extensionId);
  if (!catalogPackage) {
    return {
      ok: false,
      message: `Extension package "${extensionId}" was not found in the Axon extension registry.`,
      state: await getExtensionState(folderPath),
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
      state: await getExtensionState(folderPath),
    };
  }

  fs.mkdirSync(userExtensionsPath, { recursive: true });

  // Installing from the local marketplace copies the whole extension package,
  // not only the theme or manifest that the UI is showing. That snapshot means
  // refresh/reload reads the same package the user installed even if the
  // marketplace source changes while Axon is running.
  fs.cpSync(catalogPackage.packagePath, destinationPath, {
    recursive: true,
    errorOnExist: true,
  });
  invalidateExtensionStateCache("user");

  return {
    ok: true,
    message: `Installed ${catalogPackage.manifest.name}.`,
    state: await getExtensionState(folderPath),
  };
}
