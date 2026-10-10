/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from "node:http";

interface KernelTicketResponsePayload {
  status?: string;
  data?: { ticket?: string };
  error?: string;
}

export interface KernelControlTarget {
  controlPath?: string | null;
  port: string;
  token: string;
}

// createKernelTicket asks the kernel host for a one-shot capability bound to the
// notebook's workspace. Main, not the renderer, decides the interpreter and
// working directory, so a compromised renderer can only ever start a kernel
// inside a workspace the user already opened.
export async function requestKernelTicket(
  target: KernelControlTarget,
  body: unknown,
): Promise<{ status: number; payload: KernelTicketResponsePayload }> {
  const serialized = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      target.controlPath
        ? { socketPath: target.controlPath, path: "/kernel/ticket", method: "POST" }
        : {
            hostname: "127.0.0.1",
            port: Number(target.port),
            path: "/kernel/ticket",
            method: "POST",
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
            reject(new Error("Kernel host returned an invalid response."));
          }
        });
      },
    );
    request.setHeader("Authorization", `Bearer ${target.token}`);
    request.setHeader("Content-Type", "application/json");
    request.setHeader("Content-Length", Buffer.byteLength(serialized));
    request.once("error", reject);
    request.setTimeout(2000, () => {
      request.destroy(new Error("Kernel host did not respond in time."));
    });
    request.end(serialized);
  });
}
