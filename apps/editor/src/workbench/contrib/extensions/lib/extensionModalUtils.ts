/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : "Unknown extension error.";
}

// Brand names like "axon" read better title-cased in the UI even though the
// underlying extension id keeps the original casing.
export function formatPublisher(publisher: string) {
  if (!publisher) return publisher;
  return publisher.charAt(0).toUpperCase() + publisher.slice(1);
}

// "inactive" is the lazy default for any extension that has not been woken up.
// Only states worth a user's attention get a pill; built-in extensions must not
// look disabled just because they are sitting idle.
export function isNoteworthyLifecycle(
  lifecycle: string | null | undefined,
): lifecycle is string {
  return (
    lifecycle !== null &&
    lifecycle !== undefined &&
    lifecycle !== "inactive"
  );
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