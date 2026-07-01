import { type AiActionId } from "../../../shared/ai";

export const agentActionLabels: Record<AiActionId, string> = {
  ask: "Ask",
  "explain-selection": "Explain",
  "fix-problem": "Fix problem",
  "refactor-selection": "Refactor",
  "generate-tests": "Generate tests",
  "review-git-diff": "Review diff",
  "draft-commit-message": "Commit message",
};

export const agentQuickActions: AiActionId[] = [
  "explain-selection",
  "fix-problem",
  "refactor-selection",
  "generate-tests",
  "review-git-diff",
  "draft-commit-message",
];

export function defaultPromptForAction(action: AiActionId) {
  switch (action) {
    case "explain-selection":
      return "Explain the active code and the important edge cases.";
    case "fix-problem":
      return "Fix the most relevant problem in this context.";
    case "refactor-selection":
      return "Refactor this code for clarity without changing behavior.";
    case "generate-tests":
      return "Generate useful tests for the active code.";
    case "review-git-diff":
      return "Review this diff for bugs, regressions, and missing tests.";
    case "draft-commit-message":
      return "Draft a commit message for these changes.";
    default:
      return "";
  }
}
