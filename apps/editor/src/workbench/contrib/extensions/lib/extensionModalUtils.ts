/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown extension error.";
}

export function hasMarketplaceApi() {
  return (
    typeof window.axon.listExtensionMarketplace === "function" &&
    typeof window.axon.installExtension === "function" &&
    typeof window.axon.uninstallExtension === "function"
  );
}

export function matchesSearch(query: string, ...fields: string[]) {
  if (!query) return true;
  const normalizedQuery = query.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
}