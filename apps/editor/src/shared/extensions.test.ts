import { describe, expect, it } from "vitest";
import {
  getEnabledExtensionThemes,
  type ExtensionState,
  type ResolvedExtensionTheme,
} from "./extensions";

function theme(id: string, label: string, extensionName: string) {
  return { id, label, extensionName } as ResolvedExtensionTheme;
}

function state(
  extensions: Array<{
    enabled: boolean;
    themes: ResolvedExtensionTheme[];
  }>,
) {
  return { extensions } as ExtensionState;
}

describe("enabled extension themes", () => {
  it("keeps only the highest-precedence contribution for a theme ID", () => {
    const bundled = theme("one-dark", "One Dark", "Bundled Themes");
    const userOverride = theme("one-dark", "One Dark", "User Themes");

    expect(
      getEnabledExtensionThemes(
        state([
          { enabled: true, themes: [bundled] },
          { enabled: true, themes: [userOverride] },
        ]),
      ),
    ).toEqual([userOverride]);
  });

  it("omits disabled themes without disturbing unique enabled themes", () => {
    const enabled = theme("ayu-dark", "Ayu Dark", "Ayu");
    const disabled = theme("hidden", "Hidden", "Disabled Themes");

    expect(
      getEnabledExtensionThemes(
        state([
          { enabled: false, themes: [disabled] },
          { enabled: true, themes: [enabled] },
        ]),
      ),
    ).toEqual([enabled]);
  });
});
