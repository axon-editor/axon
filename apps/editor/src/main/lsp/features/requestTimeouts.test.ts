import { describe, expect, it } from "vitest";
import {
  getLanguageServerHoverTimeoutMs,
  getLanguageServerWarmupTimeoutMs,
} from "./requestTimeouts";

describe("language server request timeouts", () => {
  it("allows JVM servers to finish their first indexed hover", () => {
    expect(getLanguageServerHoverTimeoutMs("java")).toBe(15_000);
    expect(getLanguageServerHoverTimeoutMs("kotlin")).toBe(15_000);
    expect(getLanguageServerHoverTimeoutMs("scala")).toBe(15_000);
  });

  it("keeps normal language hover failures responsive", () => {
    expect(getLanguageServerHoverTimeoutMs("go")).toBe(2_500);
    expect(getLanguageServerHoverTimeoutMs("typescript")).toBe(2_500);
  });

  it("keeps the first JVM hover alive while the server initializes", () => {
    expect(getLanguageServerWarmupTimeoutMs("java", 8_000)).toBe(15_000);
    expect(getLanguageServerWarmupTimeoutMs("go", 8_000)).toBe(8_000);
  });
});
