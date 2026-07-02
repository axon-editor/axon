import {
  type AiActionId,
  type AiChatResult,
  type AiContextFile,
  type AiModelInfo,
} from "@axon-editor/shared/ai";
import { type GitChange } from "@axon-editor/shared/git";
import { type EditorDiagnostic } from "@axon-editor/shared/diagnostics";

export interface AgentWorkbenchContextInput {
  activeFileContent: string;
  activeFileLanguage: string;
  activeFilePath: string | null;
  diagnostics: EditorDiagnostic[];
  gitChanges: GitChange[];
}

export function actionCanApplyEdits(action?: AiActionId) {
  return (
    action === "fix-problem" ||
    action === "refactor-selection" ||
    action === "generate-tests"
  );
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

export function parseEditProposal(text: string) {
  const parsed = extractJsonObject(text);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const proposal = (
    parsed as {
      editProposal?: AiChatResult["editProposal"];
    }
  ).editProposal;
  if (!proposal?.files?.length) return undefined;
  return proposal;
}

export function stripEditProposalJson(text: string) {
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

export function buildContextFile(input: AgentWorkbenchContextInput): AiContextFile[] {
  if (!input.activeFilePath) return [];
  return [
    {
      path: input.activeFilePath,
      content: input.activeFileContent,
      languageId: input.activeFileLanguage,
      active: true,
    },
  ];
}

export function summarizeContext(input: AgentWorkbenchContextInput) {
  const parts = [
    input.activeFilePath ? "active file" : "no active file",
    `${input.diagnostics.length} problem${input.diagnostics.length === 1 ? "" : "s"}`,
    `${input.gitChanges.length} Git change${input.gitChanges.length === 1 ? "" : "s"}`,
  ];
  return parts.join(" / ");
}

export function chooseModel(models: AiModelInfo[], requestedModel: string) {
  const requested = models.find((model) => model.id === requestedModel);
  if (requested?.available) return requested.id;
  const available = models.find((model) => model.available);
  if (available) return available.id;
  if (requested) return requested.id;
  return models[0]?.id ?? requestedModel;
}

export async function collectGitDiffForAgent(
  folderPath: string,
  changes: GitChange[],
) {
  const chunks: string[] = [];
  for (const change of changes.slice(0, 12)) {
    try {
      const result = await window.axon.getGitDiff(
        folderPath,
        change.absolutePath,
        change.staged,
        change.worktreeState === "untracked",
      );
      if (result.diff.trim()) {
        chunks.push(`diff -- ${change.path}\n${result.diff}`);
      }
    } catch (err) {
      chunks.push(
        `diff -- ${change.path}\n[failed to read diff: ${
          err instanceof Error ? err.message : "unknown error"
        }]`,
      );
    }
  }

  return chunks.join("\n\n");
}
