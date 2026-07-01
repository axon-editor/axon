type MarkDetail = Record<string, string | number | boolean | null | undefined>;

const DEV = import.meta.env.DEV;

function getPerformance() {
  return typeof window !== "undefined" ? window.performance : undefined;
}

function formatDetail(detail?: MarkDetail) {
  if (!detail) return "";
  const pairs = Object.entries(detail)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length > 0 ? ` ${pairs.join(" ")}` : "";
}

export function markAxonPerformance(name: string, detail?: MarkDetail) {
  const performance = getPerformance();
  if (!performance?.mark) return;

  try {
    performance.mark(name, detail ? { detail } : undefined);
    if (DEV) {
      console.debug(`[axon:perf] mark ${name}${formatDetail(detail)}`);
    }
  } catch {
    // Performance marks are diagnostics, not app behavior. I keep this helper
    // fail-closed because startup, workspace opening, and editor mounting must
    // never break just because an older WebView or a test shim lacks the full
    // User Timing API shape.
  }
}

export function measureAxonPerformance(
  name: string,
  startMark: string,
  endMark?: string,
) {
  const performance = getPerformance();
  if (!performance?.measure) return;

  try {
    const measure = performance.measure(name, startMark, endMark);
    if (DEV) {
      console.debug(
        `[axon:perf] measure ${name} ${Math.round(measure.duration)}ms`,
      );
    }
  } catch {
    // Missing start/end marks are expected when a user enters a flow from a
    // different route, for example restoring a session instead of using the
    // folder picker. Timing should help debugging without making those normal
    // paths noisy or fragile.
  }
}
