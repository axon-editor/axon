import { type ExtensionManifest } from "@axon/extension-api";

export const AVAILABLE_EXTENSION_ACTIVATION_EVENTS = [
  "onStartup",
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
) {
  if (!enabled) return "disabled";
  return manifest.activationEvents?.[0] ?? (manifest.main ? "onStartup" : "declarative");
}

export function getExtensionLifecycle(enabled: boolean, errors: string[]) {
  return !enabled ? "disabled" : errors.length > 0 ? "error" : "active";
}
