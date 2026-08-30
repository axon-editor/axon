import { randomBytes } from "node:crypto";
import { ipcMain } from "electron";
import { type WorkspaceCapabilityRegistry } from "../workspaceCapabilities";

interface LocalAssetTicket {
  expiresAt: number;
  filePath: string;
  rendererId: number;
}

export function registerLocalAssetTicketHandler(
  registry: LocalAssetTicketRegistry,
) {
  ipcMain.handle("assets:getLocalUrl", (event, filePath: string) =>
    registry.issue(event.sender.id, filePath),
  );
}

const TICKET_LIFETIME_MS = 10 * 60 * 1000;

export class LocalAssetTicketRegistry {
  private readonly tickets = new Map<string, LocalAssetTicket>();
  private readonly ticketByRendererPath = new Map<string, string>();

  constructor(
    private readonly workspaceCapabilities: WorkspaceCapabilityRegistry,
    private readonly now: () => number = Date.now,
  ) {}

  issue(rendererId: number, requestedPath: string) {
    const filePath = this.workspaceCapabilities.assertReadablePath(
      rendererId,
      requestedPath,
    );
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

  private deleteTicket(token: string, ticket: LocalAssetTicket) {
    this.tickets.delete(token);
    this.ticketByRendererPath.delete(`${ticket.rendererId}\0${ticket.filePath}`);
  }

  private toUrl(token: string) {
    return `axon://local/${token}`;
  }
}
