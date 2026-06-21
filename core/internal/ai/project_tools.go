package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const (
	maxToolReadBytes      = 24000
	maxToolSearchFiles    = 120
	maxToolSearchMatches  = 60
	maxToolListEntries    = 500
	maxToolSearchLineSize = 220
)

type projectToolDefinition struct {
	Type     string              `json:"type"`
	Function projectToolFunction `json:"function"`
}

type projectToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type readFileArgs struct {
	Path string `json:"path"`
}

type searchProjectArgs struct {
	Query string `json:"query"`
}

type listFilesArgs struct {
	Path string `json:"path"`
}

func ProjectToolDefinitions() []projectToolDefinition {
	return []projectToolDefinition{
		{
			Type: "function",
			Function: projectToolFunction{
				Name:        "list_files",
				Description: "List project files under a relative folder path. Use this before reading files when you need to understand structure.",
				Parameters: objectSchema(map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Workspace-relative folder path. Use empty string for the workspace root.",
					},
				}, []string{}),
			},
		},
		{
			Type: "function",
			Function: projectToolFunction{
				Name:        "read_file",
				Description: "Read a UTF-8 text file from the current workspace. Paths must be workspace-relative unless the path is already inside the workspace.",
				Parameters: objectSchema(map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Workspace-relative file path to read.",
					},
				}, []string{"path"}),
			},
		},
		{
			Type: "function",
			Function: projectToolFunction{
				Name:        "search_project",
				Description: "Search text across project source, config, and docs files. Use this when the user asks where something exists or how a feature is implemented.",
				Parameters: objectSchema(map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Literal text to search for.",
					},
				}, []string{"query"}),
			},
		},
	}
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": properties,
		"required":   required,
	}
}

func RunProjectTool(ctx context.Context, request ChatRequest, name string, rawArgs json.RawMessage) string {
	if request.FolderPath == nil || strings.TrimSpace(*request.FolderPath) == "" {
		return "No workspace is open, so project tools are unavailable."
	}
	root, err := validateProjectContextRoot(*request.FolderPath)
	if err != nil {
		return "Workspace is not available: " + PublicError(err).Message
	}

	switch name {
	case "list_files":
		var args listFilesArgs
		_ = json.Unmarshal(rawArgs, &args)
		return runListFilesTool(ctx, root, args)
	case "read_file":
		var args readFileArgs
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return "read_file failed: invalid arguments."
		}
		return runReadFileTool(root, args)
	case "search_project":
		var args searchProjectArgs
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return "search_project failed: invalid arguments."
		}
		return runSearchProjectTool(ctx, root, args)
	default:
		return "Unknown project tool: " + name
	}
}

func AutomaticProjectProbe(ctx context.Context, request ChatRequest) string {
	if request.FolderPath == nil || strings.TrimSpace(*request.FolderPath) == "" {
		return ""
	}
	root, err := validateProjectContextRoot(*request.FolderPath)
	if err != nil {
		return ""
	}

	queries := promptSearchQueries(request.Prompt)
	if len(queries) == 0 {
		return ""
	}

	results := []string{"Automatic project probe:"}
	for _, query := range queries {
		result := runSearchProjectTool(ctx, root, searchProjectArgs{Query: query})
		if strings.Contains(result, "found no matches") || strings.Contains(result, "failed") {
			continue
		}
		results = append(results, result)
		if len(results) >= 3 {
			break
		}
	}
	if len(results) == 1 {
		return ""
	}
	return strings.Join(results, "\n\n")
}

func promptSearchQueries(prompt string) []string {
	seen := map[string]bool{}
	queries := []string{}
	for _, token := range strings.FieldsFunc(prompt, func(char rune) bool {
		return !(unicode.IsLetter(char) || unicode.IsDigit(char) || char == '_' || char == '.' || char == '/' || char == '-')
	}) {
		token = strings.Trim(token, "`'\".,:;()[]{}")
		if len(token) < 4 || seen[token] || isPromptStopWord(token) {
			continue
		}
		seen[token] = true
		if looksLikeProjectToken(token) {
			queries = append(queries, token)
		}
		if len(queries) >= 4 {
			break
		}
	}
	return queries
}

func looksLikeProjectToken(token string) bool {
	if strings.ContainsAny(token, "._/-") {
		return true
	}
	for _, char := range token {
		if unicode.IsUpper(char) || unicode.IsDigit(char) {
			return true
		}
	}
	return false
}

func isPromptStopWord(token string) bool {
	switch strings.ToLower(token) {
	case "which", "what", "where", "when", "file", "files", "define", "defines",
		"defined", "answer", "briefly", "explain", "implementation", "project":
		return true
	default:
		return false
	}
}

func runListFilesTool(ctx context.Context, root string, args listFilesArgs) string {
	start, err := resolveWorkspacePath(root, args.Path)
	if err != nil {
		return "list_files failed: " + err.Error()
	}
	info, err := os.Stat(start)
	if err != nil || !info.IsDir() {
		return "list_files failed: path is not a folder."
	}

	lines := []string{"list_files results:"}
	err = filepath.WalkDir(start, func(path string, entry fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if walkErr != nil {
			return nil
		}
		if path == start {
			return nil
		}
		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		relPath = filepath.ToSlash(relPath)
		if entry.IsDir() {
			if shouldSkipProjectContextDir(entry.Name()) || shouldSkipProjectContextSegment(relPath) {
				return filepath.SkipDir
			}
			lines = append(lines, relPath+"/")
		} else if !shouldSkipProjectContextFile(entry.Name(), relPath) {
			lines = append(lines, relPath)
		}
		if len(lines) >= maxToolListEntries {
			return filepath.SkipAll
		}
		return nil
	})
	if err != nil && err != filepath.SkipAll {
		return "list_files failed: " + err.Error()
	}
	if len(lines) == 1 {
		return "list_files found no files."
	}
	return strings.Join(lines, "\n")
}

func runReadFileTool(root string, args readFileArgs) string {
	path, err := resolveWorkspacePath(root, args.Path)
	if err != nil {
		return "read_file failed: " + err.Error()
	}
	info, err := os.Stat(path)
	if err != nil {
		return "read_file failed: file does not exist."
	}
	if info.IsDir() {
		return "read_file failed: path is a folder."
	}
	relPath, _ := filepath.Rel(root, path)
	relPath = filepath.ToSlash(relPath)
	if shouldSkipProjectContextFile(filepath.Base(path), relPath) {
		return "read_file skipped generated, dependency, binary, or cache file: " + relPath
	}
	content, truncated, ok := readProjectContextFile(path, info.Size(), maxToolReadBytes)
	if !ok {
		return "read_file failed: file is not readable UTF-8 text."
	}
	if truncated {
		return fmt.Sprintf("read_file result for %s [truncated]:\n%s", relPath, content)
	}
	return fmt.Sprintf("read_file result for %s:\n%s", relPath, content)
}

func runSearchProjectTool(ctx context.Context, root string, args searchProjectArgs) string {
	query := strings.TrimSpace(args.Query)
	if query == "" {
		return "search_project failed: query is required."
	}

	lines := []string{"search_project results:"}
	filesSeen := 0
	matches := 0
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if walkErr != nil || path == root {
			return nil
		}
		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		relPath = filepath.ToSlash(relPath)
		if entry.IsDir() {
			if shouldSkipProjectContextDir(entry.Name()) || shouldSkipProjectContextSegment(relPath) {
				return filepath.SkipDir
			}
			return nil
		}
		if shouldSkipProjectContextFile(entry.Name(), relPath) {
			return nil
		}
		filesSeen++
		if filesSeen > maxToolSearchFiles {
			return filepath.SkipAll
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		content, _, ok := readProjectContextFile(path, info.Size(), maxToolReadBytes)
		if !ok {
			return nil
		}
		for lineNumber, line := range strings.Split(content, "\n") {
			if !strings.Contains(strings.ToLower(line), strings.ToLower(query)) {
				continue
			}
			matches++
			lines = append(lines, fmt.Sprintf("%s:%d: %s", relPath, lineNumber+1, trimSearchLine(line)))
			if matches >= maxToolSearchMatches {
				return filepath.SkipAll
			}
		}
		return nil
	})
	if err != nil && err != filepath.SkipAll {
		return "search_project failed: " + err.Error()
	}
	if matches == 0 {
		return "search_project found no matches for: " + query
	}
	return strings.Join(lines, "\n")
}

func resolveWorkspacePath(root string, requestedPath string) (string, error) {
	candidate := strings.TrimSpace(requestedPath)
	if candidate == "" {
		return root, nil
	}
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(root, candidate)
	}
	cleanCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", err
	}
	relPath, err := filepath.Rel(root, cleanCandidate)
	if err != nil {
		return "", err
	}
	if relPath == ".." || strings.HasPrefix(relPath, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path must stay inside the workspace")
	}
	return cleanCandidate, nil
}

func trimSearchLine(line string) string {
	trimmed := strings.TrimSpace(line)
	if len(trimmed) <= maxToolSearchLineSize {
		return trimmed
	}
	return trimmed[:maxToolSearchLineSize] + "..."
}
