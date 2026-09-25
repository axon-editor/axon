/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExtensionKind } from "./manifest.js";

export type ExtensionRegistrySource = "builtin" | "marketplace" | "user" | "workspace";

export type ExtensionInstallMode = "copy" | "download";

export interface ExtensionRegistryIndex {
  version: 1;
  generatedAt?: string;
  extensions: ExtensionRegistryIndexEntry[];
}

export interface ExtensionRegistryIndexEntry {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description?: string;
  kind: ExtensionKind;
  source: ExtensionRegistrySource;
  repositoryUrl?: string;
  homepageUrl?: string;
  packageUrl?: string;
  manifestPath?: string;
  installMode: ExtensionInstallMode;
  categories?: string[];
  tags?: string[];
  icon?: string;
  // Download-mode packages are pinned by content hash so the client can verify
  // the archive before unpacking it next to already-trusted extensions. The
  // digest is a sha256 in the same lowercase hex form generated for the
  // language tool assets.
  sha256?: string;
  size?: number;
  // README markdown published alongside the package. The Downloads view has no
  // local package to read yet, so the registry copy is the only way a
  // not-yet-installed extension can show its documentation. It must be
  // self-contained: relative image paths cannot resolve before install, so the
  // registry build rewrites them to absolute https URLs.
  readme?: string;
}

// Install requests intentionally point at either a local manifest path or a
// package URL instead of exposing renderer-specific file APIs. That keeps the
// UI as a caller of the extension service, while the service owns validation,
// copying, downloading, and any future sandbox checks before the extension is
// allowed to appear as installed.
export interface ExtensionInstallRequest {
  extensionId: string;
  source: ExtensionRegistrySource;
  packageUrl?: string;
  manifestPath?: string;
  targetRoot?: string;
}

// The receipt is the handoff between install and refresh. Axon should load from
// installedPath after installation, not from the marketplace package, because a
// marketplace folder is a downloadable source and may change independently from
// the version the user chose to run.
export interface ExtensionInstallReceipt {
  extensionId: string;
  installedVersion: string;
  installedPath: string;
  source: ExtensionRegistrySource;
}
