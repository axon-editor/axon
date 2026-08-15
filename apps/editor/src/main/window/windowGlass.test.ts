import { beforeEach, describe, expect, it, vi } from "vitest";

const { nativeTheme } = vi.hoisted(() => ({
  nativeTheme: { themeSource: "system" },
}));

vi.mock("electron", () => ({ nativeTheme }));

import { synchronizeNativeGlassAppearance } from "./windowGlass";

describe("native Glass appearance", () => {
  beforeEach(() => {
    nativeTheme.themeSource = "system";
  });

  it("matches native Glass to a selected light theme", () => {
    synchronizeNativeGlassAppearance("system", "light");

    expect(nativeTheme.themeSource).toBe("light");
  });

  it("matches native Glass to a selected dark theme", () => {
    synchronizeNativeGlassAppearance("live", "dark");

    expect(nativeTheme.themeSource).toBe("dark");
  });

  it("returns native controls to the system appearance when Glass is off", () => {
    synchronizeNativeGlassAppearance("off", "light");

    expect(nativeTheme.themeSource).toBe("system");
  });
});
