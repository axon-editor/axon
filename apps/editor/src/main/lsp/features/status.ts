import { type LanguageServerStatus } from "../../../shared/lsp";
import { LANGUAGE_SERVER_DEFINITIONS } from "../definitions";
import {
  activeLanguageServerFailures,
  activeLanguageServers,
  resolveDocumentSyncServerIds,
} from "../features";
import {
  canRunCommand,
  getLanguageServerSessionKey,
  getPythonLanguageServerSettings,
  resolveLanguageServerCommand,
} from "../session";
import { hasWorkspaceMarker } from "../workspaceMarkers";

export function getLanguageServerStatus(
  folderPath: string,
  options: { relevantOnly?: boolean; languageId?: string } = {},
): Promise<LanguageServerStatus[]> {
  const activeLanguageServerIds = new Set(
    options.languageId ? resolveDocumentSyncServerIds(options.languageId) : [],
  );
  const definitions = LANGUAGE_SERVER_DEFINITIONS.filter((definition) => {
    if (!options.relevantOnly) return true;
    const sessionKey = getLanguageServerSessionKey(folderPath, definition.id);
    return (
      activeLanguageServers.has(sessionKey) ||
      activeLanguageServerIds.has(definition.id) ||
      hasWorkspaceMarker(folderPath, definition.workspaceMarkers)
    );
  });

  return Promise.all(
    definitions.map(async (definition) => {
      const resolved = resolveLanguageServerCommand(definition, folderPath);
      const relevant = hasWorkspaceMarker(
        folderPath,
        definition.workspaceMarkers,
      );
      const available = await canRunCommand(resolved.command, resolved.args);
      const sessionKey = getLanguageServerSessionKey(folderPath, definition.id);
      const session = activeLanguageServers.get(sessionKey);
      const running = Boolean(session);
      const starting = Boolean(session && !session.initialized);
      const lastFailure = activeLanguageServerFailures.get(sessionKey);
      const failed = Boolean(lastFailure && !running);
      const pythonSettings =
        definition.id === "python"
          ? await getPythonLanguageServerSettings(folderPath)
          : null;
      const pythonInterpreter =
        definition.id === "python"
          ? pythonSettings?.python.defaultInterpreterPath
          : "";
      const status = starting
        ? "starting"
        : running
          ? "running"
          : failed
            ? "failed"
            : available
              ? "available"
              : "missing";
      const bundled = Boolean(
        definition.bundledNodeServer ||
          definition.managedBundle ||
          ["typescript", "docker", "tailwind"].includes(definition.id),
      );

      return {
        id: definition.id,
        label: definition.label,
        languages: definition.languages,
        status,
        available,
        relevant,
        running,
        startable: resolved.startable,
        bundled,
        command: resolved.command,
        detail: failed
          ? "Failed to start. Open LSP logs for details."
          : starting
            ? "Starting and indexing this workspace"
            : running
              ? bundled
                ? "Running from Axon's bundled server"
                : "Running from the system server"
              : available
                ? relevant
                  ? bundled
                    ? "Bundled and ready for this workspace"
                    : "Installed and ready for this workspace"
                  : bundled
                    ? "Bundled, but no matching workspace markers found"
                    : "Installed, but no matching workspace markers found"
                : relevant
                  ? "Relevant, but the language server is not available"
                  : "Not available",
        installHint: definition.installHint,
        runtimeRequirement: definition.runtimeRequirement,
        lastError: lastFailure?.message,
        runtimeHint:
          definition.id === "python"
            ? pythonInterpreter
              ? `Interpreter: ${pythonInterpreter}`
              : "Using Pyright's default Python resolution"
            : undefined,
      };
    }),
  );
}
