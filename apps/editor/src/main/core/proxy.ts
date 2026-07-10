import { ipcMain } from "electron";

import type { CoreRequest, CoreResponse } from "../../shared/app";

interface CoreProxyDependencies {
  axonCorePort: string;
  axonCoreToken: string;
  assertWorkspaceRoot: (rendererId: number, rootPath: string) => string;
  assertWorkspacePath: (rendererId: number, candidatePath: string) => string;
}

const rendererCoreRoutes = new Set([
  "/health",
  "/fs/tree",
  "/fs/file",
  "/fs/create",
  "/fs/delete",
  "/fs/move",
  "/fs/rename",
  "/fs/search",
  "/fs/replace",
]);

export function validateRendererCorePath(rawPath: string) {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/")) {
    throw new Error("Core request path must be an absolute local path.");
  }

  const parsed = new URL(rawPath, "http://axon-core.local");
  if (parsed.origin !== "http://axon-core.local") {
    throw new Error("Core request cannot target an external origin.");
  }
  if (!rendererCoreRoutes.has(parsed.pathname)) {
    throw new Error(`Renderer access to ${parsed.pathname} is not allowed.`);
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function registerCoreProxyHandlers({
  axonCorePort,
  axonCoreToken,
  assertWorkspaceRoot,
  assertWorkspacePath,
}: CoreProxyDependencies) {
  const activeRequests = new Map<string, AbortController>();

  ipcMain.handle("core:request", async (event, request: CoreRequest) => {
    const path = validateRendererCorePath(request.path);
    const parsedPath = new URL(path, "http://axon-core.local");
    if (parsedPath.pathname.startsWith("/fs/")) {
      let rootPath = parsedPath.searchParams.get("root");
      if (!rootPath && request.body) {
        try {
          const body = JSON.parse(request.body) as { root?: unknown };
          rootPath = typeof body.root === "string" ? body.root : null;
        } catch {
          // Core owns the public invalid-JSON response. The proxy only extracts a
          // valid root when one exists, then lets Core report malformed payloads.
        }
      }
      if (!rootPath) throw new Error("Core filesystem request is missing a workspace root.");
      assertWorkspaceRoot(event.sender.id, rootPath);
    }
    const requestKey = `${event.sender.id}:${request.id}`;
    const controller = new AbortController();
    activeRequests.set(requestKey, controller);

    try {
      const headers = new Headers(request.headers);
      // The renderer may choose content metadata, but the bearer secret never
      // crosses the context bridge. Main overwrites Authorization here so an XSS
      // or compromised extension can only call the narrow route allow-list above
      // and can never recover the launch-wide credential for direct Core access.
      headers.set("Authorization", `Bearer ${axonCoreToken}`);
      const response = await fetch(`http://127.0.0.1:${axonCorePort}${path}`, {
        method: request.method ?? "GET",
        headers,
        body: request.body,
        signal: controller.signal,
      });
      const result: CoreResponse = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
      return result;
    } finally {
      activeRequests.delete(requestKey);
    }
  });

  ipcMain.handle("core:cancelRequest", (event, requestId: string) => {
    const requestKey = `${event.sender.id}:${requestId}`;
    const controller = activeRequests.get(requestKey);
    controller?.abort();
    activeRequests.delete(requestKey);
    return controller !== undefined;
  });

  ipcMain.handle("core:createTerminalTicket", async (event, workingDirectory: string) => {
    const cwd = assertWorkspacePath(event.sender.id, workingDirectory);
    const response = await fetch(
      `http://127.0.0.1:${axonCorePort}/terminal/ticket`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${axonCoreToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cwd }),
      },
    );
    if (!response.ok) {
      throw new Error(`Core rejected terminal ticket request (${response.status}).`);
    }

    const payload = (await response.json()) as {
      status?: string;
      data?: { ticket?: string };
      error?: string;
    };
    const ticket = payload.data?.ticket;
    if (payload.status !== "ok" || !ticket) {
      throw new Error(payload.error ?? "Core returned an invalid terminal ticket.");
    }
    return `ws://127.0.0.1:${axonCorePort}/terminal?ticket=${encodeURIComponent(ticket)}&cwd=${encodeURIComponent(cwd)}`;
  });
}
