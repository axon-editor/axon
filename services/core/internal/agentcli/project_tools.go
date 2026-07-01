package agentcli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
)

const maxCliToolContextBytes = 18000

// buildCliToolContext runs deterministic workspace probes before a terminal
// chat request reaches the local model. The model-native tool path is still
// useful when a stronger model calls tools correctly, but Axon's CLI must feel
// dependable with smaller local models too: questions like "can you see this
// workspace?" should always receive real workspace facts, not an apology.
func buildCliToolContext(ctx context.Context, input streamRequestInput) string {
	workspace := strings.TrimSpace(input.FolderPath)
	if workspace == "" {
		return ""
	}

	root, err := normalizeWorkspacePath(workspace)
	if err != nil {
		return ""
	}

	request := ai.ChatRequest{
		Action:      input.Action,
		Prompt:      input.Prompt,
		FolderPath:  &root,
		Diagnostics: input.Diagnostics,
		GitDiff:     input.GitDiff,
	}
	prompt := promptWithRecentUserTurns(input)

	sections := []string{
		"Axon deterministic project context:",
		"These facts were collected by the Axon CLI before the model response. Use them as ground truth and do not claim the workspace is unavailable.",
		"Workspace: " + root,
	}
	baseSectionCount := len(sections)

	if shouldAttachFileList(prompt) {
		sections = append(sections, ai.RunProjectTool(ctx, request, "list_files", mustToolArgs(map[string]string{"path": ""})))
	}

	if diagnosticContext := cliDiagnosticsContext(root, input.Diagnostics); diagnosticContext != "" {
		sections = append(sections, diagnosticContext)
	}

	if gitContext := cliGitContext(ctx, root, input, prompt); gitContext != "" {
		sections = append(sections, gitContext)
	}

	for _, path := range promptFileReferences(prompt) {
		sections = append(sections, ai.RunProjectTool(ctx, request, "read_file", mustToolArgs(map[string]string{"path": path})))
	}

	for _, query := range promptSearchQueriesForCli(prompt) {
		sections = append(sections, ai.RunProjectTool(ctx, request, "search_project", mustToolArgs(map[string]string{"query": query})))
	}

	if len(sections) == baseSectionCount {
		return ""
	}

	contextText := strings.Join(sections, "\n\n")
	if len(contextText) > maxCliToolContextBytes {
		return contextText[:maxCliToolContextBytes] + fmt.Sprintf("\n\n[Axon CLI tool context truncated by %d chars]", len(contextText)-maxCliToolContextBytes)
	}
	return contextText
}

func promptWithRecentUserTurns(input streamRequestInput) string {
	parts := []string{input.Prompt}
	for index := len(input.Conversation) - 1; index >= 0 && index >= len(input.Conversation)-6; index-- {
		message := input.Conversation[index]
		if message.Role == "user" {
			parts = append(parts, message.Content)
		}
	}
	return strings.Join(parts, "\n")
}

func mustToolArgs(values map[string]string) json.RawMessage {
	raw, _ := json.Marshal(values)
	return raw
}

func shouldAttachFileList(prompt string) bool {
	normalized := strings.ToLower(prompt)
	if strings.TrimSpace(normalized) == "" {
		return false
	}
	for _, term := range []string{
		"workspace", "codebase", "code base", "project", "folder", "file", "files",
		"what do you see", "can you see", "structure", "tree", "repo",
	} {
		if strings.Contains(normalized, term) {
			return true
		}
	}
	return false
}

func cliDiagnosticsContext(workspace string, diagnostics []ai.Diagnostic) string {
	if len(diagnostics) == 0 {
		if snapshot, err := readDiagnosticsSnapshotForWorkspace(workspace); err == nil {
			diagnostics = snapshot.Diagnostics
		}
	}
	if len(diagnostics) == 0 {
		return ""
	}

	lines := []string{"Current Axon Problems:"}
	for index, diagnostic := range diagnostics {
		if index >= 40 {
			lines = append(lines, fmt.Sprintf("[problems truncated, %d more]", len(diagnostics)-index))
			break
		}
		lines = append(lines, fmt.Sprintf("- %s:%d:%d [%s] %s", diagnostic.Path, diagnostic.Line, diagnostic.Column, diagnostic.Severity, diagnostic.Message))
	}
	return strings.Join(lines, "\n")
}

func cliGitContext(ctx context.Context, workspace string, input streamRequestInput, prompt string) string {
	if strings.TrimSpace(input.GitDiff) != "" {
		return "Git diff:\n" + trimCliToolText(input.GitDiff, 8000)
	}
	if !promptMentionsGit(prompt) {
		return ""
	}

	childCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	output, err := exec.CommandContext(childCtx, "git", "-C", workspace, "diff", "--stat").CombinedOutput()
	if err != nil || strings.TrimSpace(string(output)) == "" {
		output, err = exec.CommandContext(childCtx, "git", "-C", workspace, "diff", "--staged", "--stat").CombinedOutput()
	}
	if err != nil || strings.TrimSpace(string(output)) == "" {
		return ""
	}
	return "Git diff summary:\n" + trimCliToolText(string(output), 4000)
}

func promptMentionsGit(prompt string) bool {
	normalized := strings.ToLower(prompt)
	for _, term := range []string{"git", "diff", "commit", "staged", "unstaged", "change", "changes", "review"} {
		if strings.Contains(normalized, term) {
			return true
		}
	}
	return false
}

func promptFileReferences(prompt string) []string {
	seen := map[string]bool{}
	paths := []string{}
	for _, token := range strings.FieldsFunc(prompt, func(char rune) bool {
		return char == ' ' || char == '\n' || char == '\t' || char == ',' || char == ':' || char == ';' || char == '"' || char == '\''
	}) {
		candidate := strings.Trim(token, "`()[]{}")
		if candidate == "" || seen[candidate] {
			continue
		}
		if strings.Contains(candidate, "..") {
			continue
		}
		if strings.Contains(candidate, "/") || looksLikeSourceFile(candidate) {
			seen[candidate] = true
			paths = append(paths, filepath.Clean(candidate))
		}
		if len(paths) >= 4 {
			break
		}
	}
	return paths
}

func looksLikeSourceFile(value string) bool {
	extension := strings.ToLower(filepath.Ext(value))
	switch extension {
	case ".go", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html", ".rs", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".swift", ".kt", ".rb", ".php", ".yml", ".yaml", ".toml":
		return true
	default:
		return false
	}
}

func promptSearchQueriesForCli(prompt string) []string {
	normalized := strings.ToLower(prompt)
	shouldSearch := false
	for _, term := range []string{"where", "find", "search", "look for", "defined", "implemented", "function", "component", "class", "method"} {
		if strings.Contains(normalized, term) {
			shouldSearch = true
			break
		}
	}
	if !shouldSearch {
		return nil
	}

	seen := map[string]bool{}
	queries := []string{}
	for _, token := range strings.FieldsFunc(prompt, func(char rune) bool {
		return !(char == '_' || char == '-' || char == '.' || char == '/' || char >= '0' && char <= '9' || char >= 'A' && char <= 'Z' || char >= 'a' && char <= 'z')
	}) {
		token = strings.Trim(token, "`'\".,:;()[]{}")
		if len(token) < 4 || seen[token] || isCliSearchStopWord(token) {
			continue
		}
		seen[token] = true
		queries = append(queries, token)
		if len(queries) >= 3 {
			break
		}
	}
	return queries
}

func isCliSearchStopWord(token string) bool {
	switch strings.ToLower(token) {
	case "where", "find", "search", "look", "defined", "implemented", "function",
		"component", "class", "method", "file", "files", "project", "workspace",
		"codebase", "code", "what", "when", "which", "this", "that", "with":
		return true
	default:
		return false
	}
}

func trimCliToolText(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit] + fmt.Sprintf("\n[truncated %d chars]", len(value)-limit)
}

func workspaceContainsPath(workspace string, candidate string) bool {
	workspacePath, err := filepath.Abs(workspace)
	if err != nil {
		return false
	}
	candidatePath, err := filepath.Abs(candidate)
	if err != nil {
		return false
	}
	relative, err := filepath.Rel(workspacePath, candidatePath)
	if err != nil {
		return false
	}
	return relative == "." || relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator))
}
