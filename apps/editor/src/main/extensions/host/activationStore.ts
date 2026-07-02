import {
  type ExtensionActivationRecord,
  type ExtensionInfo,
} from "@axon/extension-api";
import { extensionMatchesActivationEvent } from "./activation";

const activationRecords = new Map<string, ExtensionActivationRecord[]>();

function readRecords(extensionId: string) {
  return activationRecords.get(extensionId) ?? [];
}

function addRecord(extension: ExtensionInfo, event: string, reason: string) {
  const existing = readRecords(extension.id);
  if (existing.some((record) => record.event === event)) return false;

  activationRecords.set(extension.id, [
    ...existing,
    {
      extensionId: extension.id,
      event,
      reason,
      activatedAt: new Date().toISOString(),
      hostKind: extension.hostKind,
    },
  ]);
  return true;
}

export function activateExtensionsForEvent(
  extensions: ExtensionInfo[],
  event: string,
  reason = event,
) {
  const activated: ExtensionActivationRecord[] = [];

  for (const extension of extensions) {
    // Activation is tracked in the main process instead of the renderer because
    // it is part of the extension host contract. Today declarative extensions
    // only expose manifest contributions, but the same record will decide which
    // isolated extension process should be started when executable extension
    // hosts are enabled. Keeping this here prevents the UI from inventing a
    // second truth that would later disagree with the real host lifecycle.
    if (!extensionMatchesActivationEvent(extension, event)) continue;
    const inserted = addRecord(extension, event, reason);
    if (!inserted) continue;

    const records = readRecords(extension.id);
    const latest = records[records.length - 1];
    if (latest) activated.push(latest);
  }

  return activated;
}

export function activateStartupExtensions(extensions: ExtensionInfo[]) {
  return activateExtensionsForEvent(extensions, "onStartup", "startup");
}

export function getExtensionActivationRecords() {
  return Array.from(activationRecords.values()).flat();
}

export function applyActivationState(extension: ExtensionInfo): ExtensionInfo {
  const records = readRecords(extension.id);
  const activatedEvents = records.map((record) => record.event);
  const latest = records[records.length - 1];

  return {
    ...extension,
    activatedEvents,
    lastActivatedAt: latest?.activatedAt ?? null,
    activationReason:
      activatedEvents[activatedEvents.length - 1] ?? extension.activationReason,
  };
}
