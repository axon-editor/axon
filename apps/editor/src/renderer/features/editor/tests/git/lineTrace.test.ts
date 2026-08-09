import { describe, expect, it } from "vitest";
import {
  createLineTraceLabel,
  formatLineTraceAge,
} from "../../lib/git/lineTrace";

const now = Date.UTC(2026, 6, 31, 12, 0, 0);

describe("Axon Line Trace formatting", () => {
  it("uses compact ages for an unobtrusive editor signature", () => {
    expect(formatLineTraceAge(now / 1000 - 45, now)).toBe("now");
    expect(formatLineTraceAge(now / 1000 - 7_200, now)).toBe("2h");
    expect(formatLineTraceAge(now / 1000 - 864_000, now)).toBe("1w");
  });

  it("keeps long commit metadata bounded", () => {
    const label = createLineTraceLabel(
      {
        lineNumber: 4,
        hash: "1234567890abcdef1234567890abcdef12345678",
        shortHash: "12345678",
        authorName: "A very long author name that should be compact",
        authorEmail: "author@example.com",
        authorTime: now / 1000 - 3_600,
        summary:
          "A very long commit summary that should not take over the editor viewport when shown",
      },
      now,
    );

    expect(label.startsWith("  ")).toBe(true);
    expect(label).not.toContain("◆");
    expect(label).toContain("1h");
    expect(label.length).toBeLessThanOrEqual(87);
  });
});
