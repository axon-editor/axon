import { type AxonSettings } from "../../shared/settings";
import {
  type AiChatRequest,
  type AiChatResult,
  type AiEditProposal,
  type AiModelInfo,
} from "../../shared/ai";
import { buildAiMessages } from "./prompts";

interface LocalModelResponse {
  message?: {
    content?: string;
  };
  response?: string;
  error?: string;
}

const defaultLocalModelUrl = "http://127.0.0.1:11434";
const providerLabel = "Axon models";

function getLocalModelBaseUrl() {
  return (process.env.AXON_MODELS_URL || defaultLocalModelUrl).replace(/\/+$/, "");
}

function getLocalModelName(settings: AxonSettings) {
  return process.env.AXON_MODELS_MODEL || settings.ai.model || "axon-code";
}

function getModelLabel(settings: AxonSettings) {
  return settings.ai.model || "Axon Code";
}

function extractJsonObject(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function isEditProposal(value: unknown): value is AiEditProposal {
  if (typeof value !== "object" || value === null) return false;
  const proposal = value as AiEditProposal;
  return (
    typeof proposal.title === "string" &&
    Array.isArray(proposal.files) &&
    proposal.files.every(
      (file) =>
        typeof file === "object" &&
        file !== null &&
        typeof file.path === "string" &&
        typeof file.summary === "string" &&
        typeof file.newContent === "string",
    )
  );
}

function parseEditProposal(text: string): AiEditProposal | undefined {
  const parsed = extractJsonObject(text);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const proposal = (parsed as { editProposal?: unknown }).editProposal;
  return isEditProposal(proposal) ? proposal : undefined;
}

function stripEditProposalJson(text: string) {
  const fenceStart = text.search(/```(?:json)?\s*{\s*"editProposal"/i);
  if (fenceStart === -1) {
    const bareStart = text.search(/^\s*{\s*"editProposal"/im);
    if (bareStart === -1) return text.trim();
    const bareEnd = text.lastIndexOf("}");
    if (bareEnd === -1) return text.trim();
    return (text.slice(0, bareStart) + text.slice(bareEnd + 1)).trim();
  }

  const fenceEnd = text.indexOf("```", fenceStart + 3);
  if (fenceEnd === -1) return text.trim();
  return (text.slice(0, fenceStart) + text.slice(fenceEnd + 3)).trim();
}

export async function listLocalAiModels(
  settings: AxonSettings,
): Promise<AiModelInfo[]> {
  const selectedModel = getLocalModelName(settings);
  try {
    const response = await fetch(`${getLocalModelBaseUrl()}/api/tags`);
    if (!response.ok) throw new Error(`model service returned ${response.status}`);
    const json = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = json.models ?? [];
    if (models.length === 0) {
      return [
        {
          id: selectedModel,
          label: getModelLabel(settings),
          providerLabel,
          available: false,
        },
      ];
    }

    return models.map((model) => ({
      id: model.name ?? selectedModel,
      label: model.name === selectedModel ? getModelLabel(settings) : "Axon model",
      providerLabel,
      available: true,
    }));
  } catch {
    return [
      {
        id: selectedModel,
        label: getModelLabel(settings),
        providerLabel,
        available: false,
      },
    ];
  }
}

export async function runLocalAiChat(
  request: AiChatRequest,
  settings: AxonSettings,
): Promise<AiChatResult> {
  if (!settings.ai.enabled) {
    return {
      success: false,
      message: "Axon Agent is disabled in settings.",
      modelLabel: getModelLabel(settings),
      providerLabel,
    };
  }

  const messages = buildAiMessages(request);
  const model = getLocalModelName(settings);

  try {
    const response = await fetch(`${getLocalModelBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: request.action === "draft-commit-message" ? 0.2 : 0.35,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(`Axon models returned ${response.status}`);
    }

    const json = (await response.json()) as LocalModelResponse;
    if (json.error) throw new Error(json.error);

    const rawMessage = json.message?.content ?? json.response ?? "";
    const editProposal = parseEditProposal(rawMessage);
    const message = stripEditProposalJson(rawMessage) || rawMessage;

    return {
      success: true,
      message: message || "No response was returned by Axon models.",
      modelLabel: getModelLabel(settings),
      providerLabel,
      editProposal,
    };
  } catch (err) {
    return {
      success: false,
      message:
        err instanceof Error
          ? err.message
          : "Axon models could not complete the request.",
      modelLabel: getModelLabel(settings),
      providerLabel,
    };
  }
}
