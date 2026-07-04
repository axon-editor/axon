import {
  type ExtensionActivationRecord,
  type ExtensionInfo,
} from "@axon/extension-api";
import { extensionMatchesActivationEvent } from "./activation";
import {
  markExtensionHostTiming,
  startExtensionHostTiming,
} from "./lib/diagnostics";

const activationRecords = new Map<string, ExtensionActivationRecord[]>();

function readRecords(extensionId: string) {
  return activationRecords.get(extensionId) ?? [];
}

function addRecord(extension: ExtensionInfo, event: string, reason: string) {
  const existing = readRecords(extension.id);
  if (
    existing.some(
      (record) => record.event === event && record.status !== "failed",
    )
  ) {
    return false;
  }

  activationRecords.set(extension.id, [
    ...existing,
    {
      extensionId: extension.id,
      event,
      reason,
      activatedAt: new Date().toISOString(),
      hostKind: extension.hostKind,
      status:
        extension.hostKind === "isolated-process" ? "activating" : "active",
    },
  ]);
  return true;
}

function updateLatestRecord(
  extensionId: string,
  status: ExtensionActivationRecord["status"],
  error?: string,
) {
  const records = readRecords(extensionId);
  const latest = records[records.length - 1];
  if (!latest) return;

  activationRecords.set(extensionId, [
    ...records.slice(0, -1),
    {
      ...latest,
      status,
      error,
    },
  ]);
}

export function markExtensionActivationActive(extensionId: string) {
  updateLatestRecord(extensionId, "active");
}

export function markExtensionActivationFailed(extensionId: string, error: string) {
  updateLatestRecord(extensionId, "failed", error);
}

export function activateExtensionsForEvent(
  extensions: ExtensionInfo[],
  event: string,
  reason = event,
) {
  const startedAt = startExtensionHostTiming();
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
    const records = readRecords(extension.id);
    const latest = records[records.length - 1];
    if (!latest) continue;
    if (inserted || latest.status === "activating") {
      activated.push(latest);
    }
  }

  markExtensionHostTiming("activation", startedAt, {
    event,
    count: activated.length,
  });
  return activated;
}

export function activateStartupExtensions(extensions: ExtensionInfo[]) {
  return activateExtensionsForEvent(extensions, "onStartup", "startup");
}

export function getExtensionActivationRecords() {
  return Array.from(activationRecords.values()).flat();
}

export function clearExtensionActivationRecords(extensionId: string) {
  activationRecords.delete(extensionId);
}

export function applyActivationState(extension: ExtensionInfo): ExtensionInfo {
  const records = readRecords(extension.id);
  const activatedEvents = records.map((record) => record.event);
  const latest = records[records.length - 1];
  const latestError = latest?.status === "failed" ? latest.error : undefined;
  const lifecycle =
    extension.lifecycle === "disabled"
      ? "disabled"
      : latest?.status === "activating"
        ? "activating"
        : latest?.status === "failed"
          ? "failed"
          : latest?.status === "active"
            ? "active"
            : extension.lifecycle;

  return {
    ...extension,
    active: lifecycle === "active",
    activatedEvents,
    lastActivatedAt: latest?.activatedAt ?? null,
    activationReason:
      activatedEvents[activatedEvents.length - 1] ?? extension.activationReason,
    errors: latestError
      ? [...extension.errors.filter((error) => error !== latestError), latestError]
      : extension.errors,
    lifecycle,
  };
}
