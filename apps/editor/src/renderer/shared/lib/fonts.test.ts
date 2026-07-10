import { describe, expect, it } from "vitest";
import { normalizeUiFontFamily } from "../../../shared/settings";
import { fontStack } from "./fonts";

describe("UI font resolution", () => {
  it("maps Axon and Zed aliases to different bundled families", () => {
    expect(fontStack(".AxonSans", "system-ui, sans-serif")).toContain(
      "Inter Variable",
    );
    expect(fontStack(".ZedSans", "system-ui, sans-serif")).toContain(
      "IBM Plex Sans Variable",
    );
    expect(fontStack(".AxonSans", "system-ui, sans-serif")).not.toBe(
      fontStack(".ZedSans", "system-ui, sans-serif"),
    );
  });

  it("migrates legacy fallback-only family names", () => {
    expect(normalizeUiFontFamily("Axon Sans")).toBe(".AxonSans");
    expect(normalizeUiFontFamily("Inter")).toBe(".AxonSans");
    expect(normalizeUiFontFamily("IBM Plex Sans")).toBe(".ZedSans");
    expect(normalizeUiFontFamily("SF Pro Text")).toBe("system-ui");
  });

  it("preserves imported custom font family names", () => {
    expect(normalizeUiFontFamily("Gorden Custom Sans")).toBe(
      "Gorden Custom Sans",
    );
  });
});
