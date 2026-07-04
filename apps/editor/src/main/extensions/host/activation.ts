import { type ExtensionInfo, type ExtensionManifest } from "@axon/extension-api";

export const AVAILABLE_EXTENSION_ACTIVATION_EVENTS = [
  "onStartup",
  "onStartupFinished",
  "onCommand",
  "onLanguage",
  "onWorkspaceContains",
  "onView",
  "onAgent",
  "onTerminalProfile",
  "onTaskType",
  "onDebugType",
];

export function getExtensionHostKind(manifest: ExtensionManifest) {
  return manifest.main ? "isolated-process" : "declarative";
}

export function getExtensionActivationReason(
  manifest: ExtensionManifest,
  enabled: boolean,
  activatedEvents: string[] = [],
) {
  if (!enabled) return "disabled";
  if (activatedEvents.length > 0) return activatedEvents[activatedEvents.length - 1];
  return manifest.activationEvents?.[0] ?? (manifest.main ? "onStartup" : "declarative");
}

export function getExtensionLifecycle(
  enabled: boolean,
  errors: string[],
  hostKind: ExtensionInfo["hostKind"],
) {
  if (!enabled) return "disabled";
  if (errors.length > 0) return "failed";
  return hostKind === "isolated-process" ? "inactive" : "active";
}

export function getActivationEventFamily(event: string) {
  const separatorIndex = event.indexOf(":");
  return separatorIndex === -1 ? event : event.slice(0, separatorIndex);
}

export function extensionMatchesActivationEvent(
  extension: ExtensionInfo,
  event: string,
) {
  if (!extension.enabled || extension.errors.length > 0) return false;
  if (extension.activationEvents.includes(event)) return true;

  const family = getActivationEventFamily(event);
  return extension.activationEvents.includes(family);
}
