import type { CoreConnection } from "../../../shared/app";

let coreConnectionPromise: Promise<CoreConnection> | null = null;

export function getCoreConnection() {
  if (!coreConnectionPromise) {
    // The token is intentionally obtained through preload instead of Vite
    // configuration or renderer globals. Build-time values end up in packaged
    // JavaScript, while this value must be fresh for every Axon process.
    coreConnectionPromise = window.axon.getCoreConnection();
  }
  return coreConnectionPromise;
}

export async function authenticatedCoreFetch(
  path: string,
  options: RequestInit = {},
) {
  const connection = await getCoreConnection();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${connection.token}`);
  return fetch(`${connection.httpUrl}${path}`, { ...options, headers });
}

export async function getCoreWebSocketUrl(path: string) {
  const connection = await getCoreConnection();
  const baseUrl = new URL(connection.httpUrl);
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = path.startsWith("/") ? path : `/${path}`;
  baseUrl.search = "";
  baseUrl.hash = "";
  baseUrl.searchParams.set("access_token", connection.token);
  return baseUrl;
}

export async function waitForCoreBackend(
  signal?: AbortSignal,
  attempts = 20,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) return false;

    try {
      const response = await authenticatedCoreFetch("/health", { signal });
      if (response.ok) return true;
    } catch {
      // Electron mounts the renderer before packaged core is necessarily ready.
      // Retrying here keeps startup asynchronous while authentication ensures an
      // unrelated process on the same port can never be mistaken for Axon Core.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }

  return false;
}
