const DEFAULT_CORE_HTTP_URL = "http://127.0.0.1:7777";

export const CORE_HTTP_URL =
  import.meta.env.VITE_AXON_CORE_URL?.replace(/\/$/, "") ??
  DEFAULT_CORE_HTTP_URL;

export function getCoreWebSocketUrl(path: string) {
  const baseUrl = new URL(CORE_HTTP_URL);
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = path.startsWith("/") ? path : `/${path}`;
  baseUrl.search = "";
  baseUrl.hash = "";
  return baseUrl;
}

export async function waitForCoreBackend(
  signal?: AbortSignal,
  attempts = 20,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) return false;

    try {
      const response = await fetch(`${CORE_HTTP_URL}/health`, { signal });
      if (response.ok) return true;
    } catch {
      // The Electron shell can mount the renderer before the packaged Go core
      // finishes listening, and development launches can start before the user
      // restarts `go run`. Retrying here prevents terminal tabs from dying on
      // a normal startup race while still returning a clear failure when the
      // backend is genuinely unavailable.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return false;
}
