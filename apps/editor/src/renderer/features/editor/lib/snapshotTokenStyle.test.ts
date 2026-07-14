import { describe, expect, it, vi } from "vitest";
import type { ThemeTokenMap } from "../../../shared/themes/types";
import { createSnapshotTokenStyleResolver } from "@axon-builtin-code-snapshot/lib/snapshotTokenStyle";

vi.hoisted(() => {
  Object.defineProperty(document, "queryCommandSupported", {
    configurable: true,
    value: () => false,
  });
});

const themeTokens = {
  "editor.foreground": "#d8dee9",
  "syntax.attribute": "#a1a1a1",
  "syntax.bracket": "#b2b2b2",
  "syntax.class": "#c3c3c3",
  "syntax.comment": "#d4d4d4",
  "syntax.constant": "#e5e5e5",
  "syntax.function": "#f6f6f6",
  "syntax.import": "#171717",
  "syntax.interface": "#282828",
  "syntax.keyword": "#393939",
  "syntax.method": "#4a4a4a",
  "syntax.number": "#5b5b5b",
  "syntax.operator": "#6c6c6c",
  "syntax.parameter": "#7d7d7d",
  "syntax.property": "#8e8e8e",
  "syntax.string": "#9f9f9f",
  "syntax.tag": "#ababab",
  "syntax.type": "#bcbcbc",
  "syntax.variable": "#cdcdcd",
} as ThemeTokenMap;

describe("resolveSnapshotTokenStyle", () => {
  it("treats JSON object keys as properties rather than plain text", () => {
    const resolveSnapshotTokenStyle = createSnapshotTokenStyleResolver(
      themeTokens,
      {},
    );
    expect(resolveSnapshotTokenStyle("string.key.json").color).toBe(
      themeTokens["syntax.property"],
    );
  });

  it("uses active extension syntax overrides", () => {
    const resolveSnapshotTokenStyle = createSnapshotTokenStyleResolver(
      themeTokens,
      {
        keyword: { color: "#ff55aa", fontStyle: "italic" },
      },
    );
    expect(resolveSnapshotTokenStyle("keyword.ts")).toEqual({
      color: "#ff55aa",
      fontStyle: "italic",
      fontWeight: "400",
    });
  });
});
