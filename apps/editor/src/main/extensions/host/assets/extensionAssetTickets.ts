/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from "node:crypto";
import {
  allowedAssetProtocolOrigin,
  createAssetProtocolResponse,
} from "../../../security/assets/assetProtocol";

// Extension package assets (README screenshots, icons) live outside every
// workspace root, so the workspace-scoped axon://local tickets cannot reach
// them. This registry is the extension-scoped equivalent: a token maps to one
// file inside one installed package and is bound to the renderer that asked.
//
// Authorization is deliberately NOT done here. The extension host validates
// that the requested relative path stays inside the package folder before it
// calls issue(), and this registry only mints opaque tokens for paths it was
// handed. Keeping the check in the host means a compromised renderer cannot
// turn a ticket into arbitrary filesystem reads, and it reuses the same
// folder-escape guards the uninstall path already relies on.

const TICKET_LIFETIME_MS = 10 * 60 * 1000;

interface ExtensionAssetTicket {
  expiresAt: number;
  filePath: string;
  rendererId: number;
}

export class ExtensionAssetTicketRegistry {
  private readonly tickets = new Map<string, ExtensionAssetTicket>();
  private readonly ticketByRendererPath = new Map<string, string>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(rendererId: number, filePath: string) {
    const rendererPathKey = `${rendererId}\0${filePath}`;
    const existingToken = this.ticketByRendererPath.get(rendererPathKey);
    const existingTicket = existingToken
      ? this.tickets.get(existingToken)
      : undefined;
    if (
      existingToken &&
      existingTicket &&
      existingTicket.expiresAt > this.now()
    ) {
      existingTicket.expiresAt = this.now() + TICKET_LIFETIME_MS;
      return this.toUrl(existingToken);
    }

    if (existingToken) this.tickets.delete(existingToken);
    const token = randomBytes(32).toString("base64url");
    this.tickets.set(token, {
      expiresAt: this.now() + TICKET_LIFETIME_MS,
      filePath,
      rendererId,
    });
    this.ticketByRendererPath.set(rendererPathKey, token);
    return this.toUrl(token);
  }

  resolve(token: string) {
    const ticket = this.tickets.get(token);
    if (!ticket) return null;
    if (ticket.expiresAt <= this.now()) {
      this.deleteTicket(token, ticket);
      return null;
    }
    return ticket.filePath;
  }

  releaseRenderer(rendererId: number) {
    for (const [token, ticket] of this.tickets) {
      if (ticket.rendererId === rendererId) this.deleteTicket(token, ticket);
    }
  }

  private deleteTicket(token: string, ticket: ExtensionAssetTicket) {
    this.tickets.delete(token);
    this.ticketByRendererPath.delete(`${ticket.rendererId}\0${ticket.filePath}`);
  }

  private toUrl(token: string) {
    return `axon://extension/${token}`;
  }
}

export function createExtensionAssetProtocolResponse(
  request: Request,
  registry: ExtensionAssetTicketRegistry,
) {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (!allowedAssetProtocolOrigin(origin)) {
      return new Response("Origin is not allowed.", { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin ?? "null",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  return createAssetProtocolResponse(request, (token) => registry.resolve(token));
}
