import { extensionHostService } from "./host/service";

export function getExtensionMarketplaceState() {
  return extensionHostService.getMarketplaceState();
}

export const getThemeMarketplaceState = getExtensionMarketplaceState;

export function installExtensionPackage(
  extensionId: string,
  folderPath?: string | null,
) {
  return extensionHostService.install(extensionId, folderPath);
}

export const installThemeExtension = installExtensionPackage;
