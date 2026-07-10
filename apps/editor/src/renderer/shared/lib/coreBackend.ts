export async function authenticatedCoreFetch(
  path: string,
  options: RequestInit = {},
) {
  const requestId = crypto.randomUUID();
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  const abortRequest = () => {
    void window.axon.cancelCoreRequest(requestId);
  };
  options.signal?.addEventListener("abort", abortRequest, { once: true });

  try {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await window.axon.coreRequest({
      id: requestId,
      path,
      method: (options.method ?? "GET") as "GET" | "POST" | "PUT" | "DELETE",
      headers,
      body: typeof options.body === "string" ? options.body : undefined,
    });
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } finally {
    options.signal?.removeEventListener("abort", abortRequest);
  }
}

export async function getCoreWebSocketUrl(path: string, workingDirectory: string) {
  const baseUrl = new URL(
    await window.axon.createTerminalTicket(workingDirectory),
  );
  baseUrl.pathname = path.startsWith("/") ? path : `/${path}`;
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
