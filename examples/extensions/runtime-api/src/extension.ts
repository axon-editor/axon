import type { AxonExtensionModule } from "@axon/extension-api" with {
  "resolution-mode": "import",
};

const extension: AxonExtensionModule = {
  activate(context, api) {
    context.subscriptions.push(
      api.commands.registerCommand("examples.runtime.hello", async (value) => {
        const requestedName = typeof value === "string" ? value.trim() : "";
        const name = requestedName || "Axon";

        // Command results cross the extension-host boundary back to the
        // workbench. Returning plain serializable data keeps that boundary
        // deterministic; renderer objects, DOM nodes, and Electron handles
        // would couple an extension to the host process that happens to run it.
        return {
          extensionId: context.extensionId,
          message: `Hello, ${name}.`,
        };
      }),
    );

    context.subscriptions.push(
      api.terminals.registerTerminalProfile("examples.runtime.node", {
        createProfile() {
          return {
            command: "node",
            args: ["--interactive"],
            env: { AXON_EXTENSION_EXAMPLE: "1" },
          };
        },
      }),
    );

    context.subscriptions.push(
      api.debug.registerDebugProvider("examples.node", {
        resolveConfiguration(configuration) {
          // A provider should preserve user fields it does not own. Adding
          // defaults through object spread prevents future launch attributes
          // from being silently discarded by an older extension.
          return {
            request: "launch",
            ...configuration,
            type: "examples.node",
          };
        },
      }),
    );

    context.subscriptions.push(
      api.workspace.registerWorkspaceIndexProvider(
        "examples.runtime.index",
        {
          async indexWorkspace(request) {
            // Workspace indexers can outlive the view that requested them. A
            // real provider must observe the supplied AbortSignal before and
            // during expensive work so closing a workspace does not leave a
            // stale scan consuming CPU in the extension host.
            if (request.signal?.aborted) return;
            void request.workspacePath;
          },
        },
      ),
    );
  },
};

export = extension;
