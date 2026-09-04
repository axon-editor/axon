import {
  type AiInlineCompletionRequest,
  type AiInlineCompletionResult,
} from "../../shared/ai";

interface CoreResponse<T> {
  status: "success" | "error";
  http_status: number;
  message: string;
  data: T | null;
  errors: Record<string, string[]> | null;
  code: string | null;
  request_id: string;
  meta: unknown | null;
}

function coreErrorMessage(json: CoreResponse<unknown>, fallback: string) {
  return json.message || json.code || fallback;
}

export async function requestCoreInlineCompletion(input: {
  axonCorePort: string;
  axonCoreToken: string;
  request: AiInlineCompletionRequest;
}): Promise<AiInlineCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  // Inline completion runs on the typing path, so it must fail quickly. A chat
  // request can reasonably stream for a while, but stale ghost text is worse
  // than no ghost text because the user has already moved on in the editor.
  // Monaco will cancel obsolete UI results; this timeout prevents the main
  // process from waiting indefinitely on a slow or wedged local model request.
  try {
    const response = await fetch(
      `http://127.0.0.1:${input.axonCorePort}/ai/inline-completion`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.axonCoreToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.request),
        signal: controller.signal,
      },
    );
    const json =
      (await response.json()) as CoreResponse<AiInlineCompletionResult>;
    if (!response.ok || json.status !== "success" || !json.data) {
      throw new Error(
        coreErrorMessage(json, `axon-core returned ${response.status}`),
      );
    }
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}
