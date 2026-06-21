import {
  type AiActionId,
  type AiChatRequest,
} from "../../shared/ai";

const actionInstructions: Record<AiActionId, string> = {
  ask: "Answer the user's question using the supplied project context.",
  "explain-selection":
    "Explain the active code clearly. Focus on behavior, data flow, edge cases, and why the code exists.",
  "fix-problem":
    "Fix the most relevant diagnostic or problem in the active context. Prefer a precise edit proposal when a file change is needed.",
  "refactor-selection":
    "Refactor the active code without changing behavior. Prefer readable, maintainable code and explain the tradeoff.",
  "generate-tests":
    "Generate meaningful tests for the active code. Prefer a concrete edit proposal that creates or updates test files.",
  "review-git-diff":
    "Review the current Git diff. Prioritize bugs, regressions, missing tests, and risky behavior.",
  "draft-commit-message":
    "Draft a production-quality commit message for the current changes. Use a concise summary and detailed bullets.",
};

function trimForPrompt(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[truncated ${value.length - limit} chars]`;
}

export function buildAiMessages(request: AiChatRequest) {
  const contextParts = [
    `Workspace: ${request.folderPath ?? "No workspace"}`,
    `Active file: ${request.activeFilePath ?? "No active file"}`,
  ];

  if (request.diagnostics.length > 0) {
    contextParts.push(
      `Diagnostics:\n${request.diagnostics
        .slice(0, 25)
        .map(
          (diagnostic) =>
            `- ${diagnostic.path}:${diagnostic.line}:${diagnostic.column} [${diagnostic.severity}] ${diagnostic.message}`,
        )
        .join("\n")}`,
    );
  }

  if (request.gitChanges.length > 0) {
    contextParts.push(
      `Git changes:\n${request.gitChanges
        .slice(0, 50)
        .map(
          (change) =>
            `- ${change.path} staged=${change.staged} unstaged=${change.unstaged} index=${change.indexState} worktree=${change.worktreeState}`,
        )
        .join("\n")}`,
    );
  }

  if (request.gitDiff) {
    contextParts.push(`Git diff:\n${trimForPrompt(request.gitDiff, 16000)}`);
  }

  for (const file of request.files.slice(0, 6)) {
    contextParts.push(
      `File: ${file.path} (${file.languageId})${file.active ? " [active]" : ""}\n${trimForPrompt(file.content, file.active ? 24000 : 8000)}`,
    );
  }

  return [
    {
      role: "system",
      content:
        "You are Axon Agent, the local coding assistant inside Axon Editor. You are project-aware, direct, and precise. Do not claim to use external cloud services. When proposing file edits, include a JSON block exactly shaped as {\"editProposal\":{\"title\":\"...\",\"files\":[{\"path\":\"absolute or workspace path\",\"summary\":\"...\",\"newContent\":\"full file content\"}]}}. Outside edit proposals, answer normally.",
    },
    {
      role: "user",
      content: [
        `Action: ${request.action}`,
        `Instruction: ${actionInstructions[request.action]}`,
        `User prompt: ${request.prompt || "(no extra prompt)"}`,
        "Context:",
        contextParts.join("\n\n---\n\n"),
      ].join("\n\n"),
    },
  ];
}
