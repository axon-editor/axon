/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, ipcMain: { handle: vi.fn() } }));

import { createTerminalShellResolver } from "./proxy";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

function startShellHost(
  handler: (request: http.IncomingMessage) => { status: number; body: unknown },
) {
  const server = http.createServer((request, response) => {
    const result = handler(request);
    response.writeHead(result.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  servers.push(server);
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(String((server.address() as AddressInfo).port));
    });
  });
}

describe("createTerminalShellResolver", () => {
  it("returns the shell the terminal host resolved", async () => {
    const port = await startShellHost((request) => {
      expect(request.method).toBe("GET");
      expect(request.url).toBe("/terminal/shell");
      expect(request.headers.authorization).toBe("Bearer host-token");
      return { status: 200, body: { status: "ok", data: { shell: "/bin/zsh" } } };
    });

    const resolveShell = createTerminalShellResolver({
      axonPtyPort: port,
      axonPtyToken: "host-token",
    });

    expect(await resolveShell()).toBe("/bin/zsh");
  });

  it("returns null when the host rejects the request", async () => {
    const port = await startShellHost(() => ({ status: 401, body: { status: "error" } }));
    const resolveShell = createTerminalShellResolver({
      axonPtyPort: port,
      axonPtyToken: "wrong-token",
    });

    expect(await resolveShell()).toBeNull();
  });

  it("returns null when the host reports no shell", async () => {
    const port = await startShellHost(() => ({
      status: 200,
      body: { status: "ok", data: { shell: "   " } },
    }));
    const resolveShell = createTerminalShellResolver({
      axonPtyPort: port,
      axonPtyToken: "host-token",
    });

    expect(await resolveShell()).toBeNull();
  });

  it("returns null instead of failing when the host is not listening", async () => {
    // The terminal host may never start on a machine without a usable shell, and
    // history suggestions must degrade to platform defaults rather than throw.
    const resolveShell = createTerminalShellResolver({
      axonPtyPort: "1",
      axonPtyToken: "host-token",
    });

    expect(await resolveShell()).toBeNull();
  });
});
