/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import yauzl from "yauzl";
import {
  type ExtensionActionResult,
  type ExtensionRegistryIndexEntry,
} from "@axon/extension-api";
import { EXTENSION_MANIFEST_FILE, getUserExtensionsPath } from "../../paths";
import { getExtensionState, invalidateExtensionStateCache } from "../state/state";
import { readCatalogPackages, type CatalogPackage } from "./marketplace";
import {
  getRemoteRegistryEntry,
  isAllowedRemoteHost,
  REMOTE_EXTENSION_PACKAGE_MAX_BYTES,
} from "./remoteRegistry";
import { normalizeExtensionManifest } from "../shared/manifest";
import { readJsonFile } from "../shared/json";

const PACKAGE_DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

async function getCatalogPackage(extensionId: string) {
  const catalogPackages = await readCatalogPackages();
  return catalogPackages.find(
    (catalogPackage) => catalogPackage.manifest.id === extensionId,
  );
}

function sanitizePackageFolderName(extensionId: string) {
  return extensionId.replace(/[^a-zA-Z0-9._-]/g, "-");
}

// Archives can declare folder names that point outside the extraction root.
// yauzl validates entry names, but I keep an explicit guard here so a malformed
// package is rejected before a single file touches the staging directory.
function assertSafeEntryName(entryName: string) {
  if (
    entryName.includes("\\") ||
    entryName.startsWith("/") ||
    entryName.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`The extension package contains an unsafe path: ${entryName}`);
  }
}

function openZipReadStream(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) reject(err);
      else resolve(readStream);
    });
  });
}

function openZip(zipPath: string) {
  return new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error("Failed to open the extension package."));
      else resolve(zipfile);
    });
  });
}

async function extractPackageZip(zipPath: string, destinationRoot: string) {
  await fs.promises.mkdir(destinationRoot, { recursive: true });
  const zipfile = await openZip(zipPath);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    zipfile.on("error", fail);
    zipfile.on("end", finish);

    zipfile.on("entry", (entry: yauzl.Entry) => {
      if (settled) return;
      try {
        assertSafeEntryName(entry.fileName);
      } catch (err) {
        fail(err as Error);
        zipfile.close();
        return;
      }

      const isJunkEntry =
        entry.fileName.split("/").includes("__MACOSX") ||
        entry.fileName === ".DS_Store" ||
        entry.fileName.endsWith("/.DS_Store");

      if (entry.fileName.endsWith("/") || isJunkEntry) {
        zipfile.readEntry();
        return;
      }

      const targetPath = path.join(destinationRoot, entry.fileName);
      if (!targetPath.startsWith(destinationRoot + path.sep)) {
        fail(new Error(`The extension package wrote outside its staging folder: ${entry.fileName}`));
        zipfile.close();
        return;
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      void openZipReadStream(zipfile, entry)
        .then((readStream) => {
          const output = fs.createWriteStream(targetPath);
          readStream.on("error", (err) => fail(err));
          output.on("error", (err) => fail(err));
          output.on("close", () => zipfile.readEntry());
          readStream.pipe(output);
        })
        .catch((err) => {
          fail(err);
          zipfile.close();
        });
    });

    zipfile.readEntry();
  });
}

async function downloadPackage(entry: ExtensionRegistryIndexEntry) {
  if (
    !entry.packageUrl ||
    !entry.sha256 ||
    !isAllowedRemoteHost(entry.packageUrl)
  ) {
    throw new Error(`${entry.name} has no verifiable package source.`);
  }

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), PACKAGE_DOWNLOAD_IDLE_TIMEOUT_MS);
  };

  try {
    resetIdleTimer();
    const response = await fetch(entry.packageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": `Axon/${app.getVersion()}` },
    });
    if (!response.ok || !response.body) {
      throw new Error(`The extension package download failed with HTTP ${response.status}.`);
    }
    // GitHub raw files 302 to objects.githubusercontent.com; the response URL
    // must stay on an allowed host just like the original package URL.
    if (!isAllowedRemoteHost(response.url)) {
      throw new Error("The extension package redirected to an untrusted host.");
    }

    const tempZipPath = path.join(
      os.tmpdir(),
      `axon-extension-${sanitizePackageFolderName(entry.id)}-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`,
    );
    const file = await fs.promises.open(tempZipPath, "w", 0o600);
    const reader = response.body.getReader();
    const hash = createHash("sha256");
    let transferred = 0;

    try {
      for (;;) {
        if (controller.signal.aborted) {
          throw new Error("The extension package download stalled and was cancelled.");
        }
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
        transferred += value.byteLength;
        if (transferred > REMOTE_EXTENSION_PACKAGE_MAX_BYTES) {
          throw new Error("The extension package exceeds the size limit.");
        }
        hash.update(value);
        await file.write(value);
      }
    } finally {
      await file.close();
      if (controller.signal.aborted) {
        await reader.cancel(controller.signal.reason).catch(() => {});
      }
    }

    const digest = hash.digest("hex");
    if (digest !== entry.sha256) {
      await fs.promises.rm(tempZipPath, { force: true });
      throw new Error(
        `The extension package failed checksum verification (expected ${entry.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…).`,
      );
    }
    return tempZipPath;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

async function installFromCatalog(
  catalogPackage: CatalogPackage,
  userExtensionsPath: string,
  folderPath?: string | null,
): Promise<ExtensionActionResult> {
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

async function installFromRemote(
  entry: ExtensionRegistryIndexEntry,
  userExtensionsPath: string,
  folderPath?: string | null,
): Promise<ExtensionActionResult> {
  const destinationPath = path.join(
    userExtensionsPath,
    sanitizePackageFolderName(entry.id),
  );

  if (fs.existsSync(destinationPath)) {
    return {
      ok: true,
      message: `${entry.name} is already installed.`,
      state: await getExtensionState(folderPath),
    };
  }

  fs.mkdirSync(userExtensionsPath, { recursive: true });

  // Remote packages are extracted into a staging folder and only moved into
  // the user extensions root after the archive checksum matches and the
  // manifest id confirms the package is exactly what the registry advertised.
  // A partially extracted download therefore never appears as installed.
  const stagingPath = path.join(
    os.tmpdir(),
    `axon-extension-stage-${sanitizePackageFolderName(entry.id)}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  let tempZipPath: string | null = null;

  try {
    tempZipPath = await downloadPackage(entry);
    await extractPackageZip(tempZipPath, stagingPath);

    const manifest = normalizeExtensionManifest(
      await readJsonFile(path.join(stagingPath, EXTENSION_MANIFEST_FILE)),
    );
    if (!manifest || manifest.id !== entry.id) {
      throw new Error(`The package "${entry.id}" does not contain a matching extension manifest.`);
    }

    fs.renameSync(stagingPath, destinationPath);
    invalidateExtensionStateCache("user");

    return {
      ok: true,
      message: `Installed ${manifest.name}.`,
      state: await getExtensionState(folderPath),
    };
  } catch (err) {
    fs.rmSync(stagingPath, { recursive: true, force: true });
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : `Failed to install ${entry.name}.`,
      state: await getExtensionState(folderPath),
    };
  } finally {
    if (tempZipPath) fs.rmSync(tempZipPath, { force: true });
  }
}

export async function installExtensionPackage(
  extensionId: string,
  folderPath?: string | null,
): Promise<ExtensionActionResult> {
  const userExtensionsPath = getUserExtensionsPath();

  const catalogPackage = await getCatalogPackage(extensionId);
  if (catalogPackage) {
    return await installFromCatalog(catalogPackage, userExtensionsPath, folderPath);
  }

  const remoteEntry = await getRemoteRegistryEntry(extensionId);
  if (!remoteEntry || remoteEntry.installMode !== "download") {
    return {
      ok: false,
      message: `Extension package "${extensionId}" was not found in the Axon extension registry.`,
      state: await getExtensionState(folderPath),
    };
  }

  return await installFromRemote(remoteEntry, userExtensionsPath, folderPath);
}