import {
  type ExtensionInfo,
  type ExtensionRuntimeRegistration,
} from "@axon/extension-api";
import { getRuntimeDiagnostics } from "./runtimeHost";

export interface ExtensionRuntimeSummary {
  executableCount: number;
  declarativeCount: number;
  mode: "declarative" | "isolated-process";
  message: string;
}

export function summarizeExtensionRuntime(
  extensions: ExtensionInfo[],
): ExtensionRuntimeSummary {
  const executableCount = extensions.filter(
    (extension) => extension.hostKind === "isolated-process" && extension.enabled,
  ).length;
  const declarativeCount = extensions.filter(
    (extension) => extension.hostKind === "declarative" && extension.enabled,
  ).length;

  // This is the first executable-extension wiring point. Axon now separates
  // declarative manifests from packages that declare a `main` entry, so the host
  // can route those packages into an isolated runtime instead of pretending they
  // are just metadata. The actual process sandbox can build on this summary
  // without changing extension discovery again.
  return {
    executableCount,
    declarativeCount,
    mode: executableCount > 0 ? "isolated-process" : "declarative",
    message:
      executableCount > 0
        ? `${executableCount} executable extension package${executableCount === 1 ? "" : "s"} registered for isolated activation.`
        : "Declarative extension contributions are active.",
  };
}

export function createExtensionRuntimeRegistrations(
  extensions: ExtensionInfo[],
): ExtensionRuntimeRegistration[] {
  return extensions
    .filter((extension) => extension.enabled)
    .map((extension) => {
      const runtimeDiagnostics = getRuntimeDiagnostics(extension);
      const contributes = extension.contributes;
      const commandIds = [
        ...new Set([
          ...contributes.commands.map((command) => command.id),
          ...runtimeDiagnostics.commands,
        ]),
      ];
      const viewIds = [
        ...new Set([
          ...contributes.views.map((view) => view.id),
          ...runtimeDiagnostics.views,
        ]),
      ];
      const terminalProfileIds = [
        ...new Set([
          ...contributes.terminalProfiles.map((profile) => profile.id),
          ...runtimeDiagnostics.terminalProfiles,
        ]),
      ];
      const agentIds = contributes.agents.map((agent) => agent.id);
      const contributionCount =
        commandIds.length +
        viewIds.length +
        terminalProfileIds.length +
        agentIds.length;

      // This runtime registration is the bridge between today's declarative
      // manifests and the isolated activate() host. It gives the workbench a
      // single place to inspect which runtime-owned entry points exist without
      // pretending that executable extension code is already running.
      return {
        extensionId: extension.id,
        extensionName: extension.name,
        hostKind: extension.hostKind,
        commands: commandIds,
        views: viewIds,
        terminalProfiles: terminalProfileIds,
        agents: agentIds,
        activatedEvents: extension.activatedEvents,
        lastActivatedAt: extension.lastActivatedAt,
        status:
          extension.errors.length > 0 || runtimeDiagnostics.errors.length > 0
            ? "error"
            : extension.lifecycle === "activating"
              ? "activating"
            : runtimeDiagnostics.activated
              ? "registered"
            : extension.hostKind === "isolated-process" &&
                extension.activatedEvents.length === 0
              ? "waiting"
              : "registered",
        message:
          extension.errors[0] ??
          runtimeDiagnostics.errors[0] ??
          (runtimeDiagnostics.activated
            ? `Runtime activated with ${runtimeDiagnostics.commands.length} command${runtimeDiagnostics.commands.length === 1 ? "" : "s"}.`
            : undefined) ??
          (contributionCount > 0
            ? `${contributionCount} runtime contribution${contributionCount === 1 ? "" : "s"} registered.`
            : "No runtime contributions declared."),
      } satisfies ExtensionRuntimeRegistration;
    });
}
