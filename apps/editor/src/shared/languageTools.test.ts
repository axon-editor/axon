import { describe, expect, it } from "vitest";
import {
  isManagedLanguageToolProgressActive,
  type ManagedLanguageToolPhase,
} from "./languageTools";

describe("managed language tool progress", () => {
  it.each<ManagedLanguageToolPhase>([
    "resolving",
    "downloading",
    "verifying",
    "extracting",
    "installing",
    "cancelling",
  ])("keeps %s visible as active work", (phase) => {
    expect(isManagedLanguageToolProgressActive({ id: "java", phase })).toBe(
      true,
    );
  });

  it.each<ManagedLanguageToolPhase>([
    "idle",
    "installed",
    "cancelled",
    "error",
  ])("treats %s as terminal", (phase) => {
    expect(isManagedLanguageToolProgressActive({ id: "java", phase })).toBe(
      false,
    );
  });
});
