import { app, ipcMain } from "electron";
import http from "node:http";

import type { CoreRequest, CoreResponse } from "../../shared/app";

interface CoreProxyDependencies {
  axonCorePort: string;
  axonCoreToken: string;
  axonPtyPort: string;
  axonPtyToken: string;
  axonPtyControlPath?: string | null;
  ensureTerminalHostReady?: () => Promise<void>;
  assertWorkspaceRoot: (rendererId: number, rootPath: string) => string;
  assertWorkspacePath: (rendererId: number, candidatePath: string) => string;
  resolveWorkspaceRoot: (rendererId: number, candidatePath: string) => string;
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

interface TerminalTicketPayload {
  status?: string;
  data?: { ticket?: string };
  error?: string;
}

function requestTerminalTicket(input: {
  body: string;
  controlPath?: string | null;
  port: string;
  token: string;
}) {
  return new Promise<{ status: number; payload: TerminalTicketPayload }>(
    (resolve, reject) => {
      const request = http.request(
        input.controlPath
          ? {
              socketPath: input.controlPath,
              path: "/terminal/ticket",
              method: "POST",
              headers: {
                Authorization: `Bearer ${input.token}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(input.body),
              },
            }
          : {
              hostname: "127.0.0.1",
              port: Number(input.port),
              path: "/terminal/ticket",
              method: "POST",
              headers: {
                Authorization: `Bearer ${input.token}`,
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(input.body),
              },
            },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            try {
              resolve({
                status: response.statusCode ?? 500,
                payload: JSON.parse(Buffer.concat(chunks).toString("utf8")),
              });
            } catch {
              reject(new Error("Terminal host returned an invalid response."));
            }
          });
        },
      );
      request.once("error", reject);
      request.setTimeout(1500, () => {
        request.destroy(new Error("Terminal host did not respond in time."));
      });
      request.end(input.body);
    },
  );
}

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
  axonPtyPort,
  axonPtyToken,
  axonPtyControlPath,
  ensureTerminalHostReady,
  assertWorkspaceRoot,
  assertWorkspacePath,
  resolveWorkspaceRoot,
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
      if (!rootPath)
        throw new Error("Core filesystem request is missing a workspace root.");
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

  ipcMain.handle(
    "core:createTerminalTicket",
    async (event, workingDirectory: string | null) => {
      // Empty editor windows have no workspace capability yet, but users still
      // expect File > New Window to provide a usable shell. Main chooses the
      // home directory itself for that case; the renderer never receives a
      // filesystem capability for home, and a non-empty renderer-supplied path
      // must still pass the normal workspace boundary checks.
      const cwd = workingDirectory
        ? assertWorkspacePath(event.sender.id, workingDirectory)
        : app.getPath("home");
      const workspaceRoot = workingDirectory
        ? resolveWorkspaceRoot(event.sender.id, cwd)
        : cwd;

      // The renderer can request a terminal while the packaged PTY host is
      // still starting, or immediately after an unexpected host exit. Waiting
      // on the controller here makes terminal creation the recovery boundary:
      // a dead child is replaced before the private ticket socket is used, so
      // restored tabs do not retry ECONNREFUSED forever after a folder switch.
      await ensureTerminalHostReady?.();
      const response = await requestTerminalTicket({
        body: JSON.stringify({ cwd, workspaceRoot }),
        controlPath: axonPtyControlPath,
        port: axonPtyPort,
        token: axonPtyToken,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Terminal host rejected ticket request (${response.status}).`,
        );
      }

      const payload = response.payload;
      const ticket = payload.data?.ticket;
      if (payload.status !== "ok" || !ticket) {
        throw new Error(
          payload.error ?? "Terminal host returned an invalid ticket.",
        );
      }
      return `ws://127.0.0.1:${axonPtyPort}/terminal?ticket=${encodeURIComponent(ticket)}&workspaceRoot=${encodeURIComponent(workspaceRoot)}&cwd=${encodeURIComponent(cwd)}`;
    },
  );
}
