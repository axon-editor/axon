import { readSettingsForFolder } from "../settings/io";

export async function warmUpAiRuntime(input: { axonCorePort: string }) {
  const settings = await readSettingsForFolder(null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    await fetch(
      `http://127.0.0.1:${input.axonCorePort}/ai/runtime?model=${encodeURIComponent(settings.ai.model)}`,
      { signal: controller.signal },
    );
  } catch (err) {
    // AI warmup must never block the editor from opening. The Ask Axon panel
    // still performs its own runtime check, so this path is only a best-effort
    // startup optimization for users who expect local models to be ready before
    // they ask the first question.
    console.warn(
      "Axon models runtime warmup failed:",
      err instanceof Error ? err.message : err,
    );
  } finally {
    clearTimeout(timeout);
  }
}
