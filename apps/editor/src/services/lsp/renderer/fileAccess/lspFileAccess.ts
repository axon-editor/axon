/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const externalLanguageToolFiles = new Set<string>();

function normalizedPath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(normalized)
    ? normalized.toLowerCase()
    : normalized;
}

function isFileInsideWorkspace(filePath: string, folderPath: string) {
  const normalizedFile = normalizedPath(filePath);
  const normalizedFolder = normalizedPath(folderPath);
  return (
    normalizedFile === normalizedFolder ||
    normalizedFile.startsWith(`${normalizedFolder}/`)
  );
}

export function registerExternalLanguageToolFile(filePath: string) {
  externalLanguageToolFiles.add(normalizedPath(filePath));
}

export function canUseWorkspaceLanguageTools(
  filePath: string,
  folderPath: string,
) {
  return (
    isFileInsideWorkspace(filePath, folderPath) ||
    externalLanguageToolFiles.has(normalizedPath(filePath))
  );
}
