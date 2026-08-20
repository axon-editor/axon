import { describe, expect, it } from "vitest";
import {
  getTerminalTicketReconnectDelay,
  TERMINAL_TICKET_RECONNECT_MAX_MS,
  TERMINAL_TICKET_RECONNECT_MIN_MS,
} from "./terminalProtocol";

describe("getTerminalTicketReconnectDelay", () => {
  it("backs off repeated host failures without delaying the first recovery", () => {
    expect(getTerminalTicketReconnectDelay(1)).toBe(
      TERMINAL_TICKET_RECONNECT_MIN_MS,
    );
    expect(getTerminalTicketReconnectDelay(2)).toBe(3_000);
    expect(getTerminalTicketReconnectDelay(3)).toBe(6_000);
  });

  it("caps a prolonged outage instead of growing beyond a useful retry", () => {
    expect(getTerminalTicketReconnectDelay(20)).toBe(
      TERMINAL_TICKET_RECONNECT_MAX_MS,
    );
  });
});
