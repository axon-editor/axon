// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	iofs "io/fs"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	axonfs "github.com/GordenArcher/axon-core/internal/fs"
)

const (
	maxToolReadBytes       = 24000
	defaultToolReadLines   = 400
	maxToolReadLines       = 2000
	maxToolReadLineRunes   = 2000
	maxToolReadFileBytes   = 2 * 1024 * 1024
	toolFileSampleBytes    = 8192
	toolFileReadBufferSize = 1024
	defaultToolListEntries = 200
	maxToolListEntries     = 500
	defaultToolListDepth   = 1
	maxToolListDepth       = 4
	defaultToolGlobEntries = 200
	maxToolGlobEntries     = 500
	defaultToolGrepMatches = 60
	maxToolGrepMatches     = 200
	maxToolSearchMatches   = 60
	toolPageLookahead      = 1
)

type ProjectToolDefinition struct {
	Type     string              `json:"type"`
	Function ProjectToolFunction `json:"function"`
}

type ProjectToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type readFileArgs struct {
	Path   string `json:"path"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
}

type searchProjectArgs struct {
	Query string `json:"query"`
}

type listFilesArgs struct {
	Path   string `json:"path"`
	Offset int    `json:"offset"`
	Limit  int    `json:"limit"`
	Depth  int    `json:"depth"`
}

type globArgs struct {
	Pattern string `json:"pattern"`
	Path    string `json:"path"`
	Offset  int    `json:"offset"`
	Limit   int    `json:"limit"`
}

type grepArgs struct {
	Pattern       string `json:"pattern"`
	Path          string `json:"path"`
	Glob          string `json:"glob"`
	CaseSensitive bool   `json:"case_sensitive"`
	FixedStrings  bool   `json:"fixed_strings"`
	Offset        int    `json:"offset"`
	Limit         int    `json:"limit"`
}

func ProjectToolDefinitions() []ProjectToolDefinition {
	return []ProjectToolDefinition{
		{
			Type: "function",
			Function: ProjectToolFunction{
				Name:        "list_files",
				Description: "List files and folders inside the workspace. Returns immediate children by default; set depth to include nested levels. Use glob to find files by name and grep to search contents. Paginate with offset and limit.",
				Parameters: objectSchema(map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Workspace-relative folder path. Use empty string for the workspace root.",
					},
					"offset": map[string]any{
						"type":        "integer",
						"description": "Zero-based entry offset for pagination. Defaults to 0.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Maximum entries to return. Defaults to 200, maximum 500.",
					},
					"depth": map[string]any{
						"type":        "integer",
						"description": "How many folder levels to include. Defaults to 1 (immediate children), maximum 4.",
					},
				}, []string{}),
			},
		},
		{
			Type: "function",
			Function: ProjectToolFunction{
				Name:        "glob",
				Description: "Find files by workspace-relative glob pattern. Supports ** for any depth, for example **/main.go or src/**/*.ts. Returns files only. Paginate with offset and limit.",
				Parameters: objectSchema(map[string]any{
					"pattern": map[string]any{
						"type":        "string",
						"description": "Glob pattern such as **/main.go or src/**/*.ts.",
					},
					"path": map[string]any{
						"type":        "string",
						"description": "Optional workspace-relative folder or file to search inside.",
					},
					"offset": map[string]any{
						"type":        "integer",
						"description": "Zero-based match offset for pagination. Defaults to 0.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Maximum matches to return. Defaults to 200, maximum 500.",
					},
				}, []string{"pattern"}),
			},
		},
		{
			Type: "function",
			Function: ProjectToolFunction{
				Name:        "grep",
				Description: "Search file contents with a regular expression. Use glob to restrict files, path to restrict a folder or file, and fixed_strings for literal text. Results include path:line:column and a preview. Paginate with offset and limit.",
				Parameters: objectSchema(map[string]any{
					"pattern": map[string]any{
						"type":        "string",
						"description": "Regular expression to search for. Use fixed_strings true for literal text.",
					},
					"path": map[string]any{
						"type":        "string",
						"description": "Optional workspace-relative folder or file to search.",
					},
					"glob": map[string]any{
						"type":        "string",
						"description": "Optional include glob such as **/*.go to restrict matching files.",
					},
					"case_sensitive": map[string]any{
						"type":        "boolean",
						"description": "Match case exactly. Defaults to false.",
					},
					"fixed_strings": map[string]any{
						"type":        "boolean",
						"description": "Treat pattern as literal text instead of a regular expression. Defaults to false.",
					},
					"offset": map[string]any{
						"type":        "integer",
						"description": "Zero-based match offset for pagination. Defaults to 0.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Maximum matches to return. Defaults to 60, maximum 200.",
					},
				}, []string{"pattern"}),
			},
		},
		{
			Type: "function",
			Function: ProjectToolFunction{
				Name:        "read_file",
				Description: "Read a UTF-8 text file from the current workspace with line numbers. Use offset and limit to page through large files; follow the continuation footer to read more.",
				Parameters: objectSchema(map[string]any{
					"path": map[string]any{
						"type":        "string",
						"description": "Workspace-relative file path to read.",
					},
					"offset": map[string]any{
						"type":        "integer",
						"description": "First line to return, starting at 1. Defaults to 1.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Maximum lines to return. Defaults to 400, maximum 2000.",
					},
				}, []string{"path"}),
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
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return "list_files failed: invalid arguments."
		}
		return runListFilesTool(ctx, root, args)
	case "glob":
		var args globArgs
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return "glob failed: invalid arguments."
		}
		return runGlobTool(ctx, root, args)
	case "grep":
		var args grepArgs
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return "grep failed: invalid arguments."
		}
		return runGrepTool(ctx, root, args)
	case "read_file":
		var args readFileArgs
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return "read_file failed: invalid arguments."
		}
		return runReadFileTool(root, args)
	case "search_project":
		// search_project was the first-generation project search. It stays as a
		// runtime alias so old persisted conversations and CLI probes still work,
		// but it is no longer exposed to the model because grep is a superset.
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
	if err != nil {
		return "list_files failed: path does not exist."
	}
	if !info.IsDir() {
		return "list_files failed: path is not a folder."
	}

	offset := args.Offset
	if offset < 0 {
		offset = 0
	}
	limit := clampToolLimit(args.Limit, defaultToolListEntries, maxToolListEntries)
	depth := args.Depth
	if depth <= 0 {
		depth = defaultToolListDepth
	}
	if depth > maxToolListDepth {
		depth = maxToolListDepth
	}

	// Breadth-first instead of filepath.WalkDir because a depth-first walk of a
	// large app folder used the whole entry budget before it reached the rest of
	// the requested level. Listing the requested level first makes every sibling
	// visible even when a nested folder is huge.
	type directoryJob struct {
		path  string
		level int
	}
	queue := []directoryJob{{path: start, level: 1}}
	entries := []string{}
	skipped := 0
	hasMore := false

	for len(queue) > 0 && !hasMore {
		if ctx.Err() != nil {
			return "list_files failed: " + ctx.Err().Error()
		}

		job := queue[0]
		queue = queue[1:]
		directoryEntries, err := os.ReadDir(job.path)
		if err != nil {
			continue
		}

		for _, entry := range directoryEntries {
			path := filepath.Join(job.path, entry.Name())
			relPath, err := filepath.Rel(root, path)
			if err != nil {
				continue
			}
			relPath = filepath.ToSlash(relPath)
			isDirectory := entry.IsDir()

			if isDirectory {
				if shouldSkipProjectContextDir(entry.Name()) || shouldSkipProjectContextSegment(relPath) {
					continue
				}
			} else if shouldSkipProjectContextFile(entry.Name(), relPath) {
				continue
			}

			if skipped < offset {
				skipped++
				if isDirectory && job.level < depth {
					queue = append(queue, directoryJob{path: path, level: job.level + 1})
				}
				continue
			}
			if len(entries) >= limit {
				hasMore = true
				break
			}

			line := relPath
			if isDirectory {
				line += "/"
			}
			entries = append(entries, line)
			if isDirectory && job.level < depth {
				queue = append(queue, directoryJob{path: path, level: job.level + 1})
			}
		}
	}

	displayPath := "."
	if relativePath, err := filepath.Rel(root, start); err == nil && relativePath != "." {
		displayPath = filepath.ToSlash(relativePath)
	}
	if len(entries) == 0 {
		if offset > 0 {
			return fmt.Sprintf("list_files found no entries at offset %d for %s.", offset, displayPath)
		}
		return "list_files found no files."
	}

	lines := []string{fmt.Sprintf(
		"list_files results for %s (depth %d; generated, dependency, and binary entries are omitted):",
		displayPath,
		depth,
	)}
	lines = append(lines, entries...)
	if offset > 0 {
		lines = append(lines, fmt.Sprintf("Page starts at offset %d.", offset))
	}
	if hasMore {
		lines = append(lines, fmt.Sprintf(
			"More entries available. Call list_files with offset=%d for the next page.",
			offset+len(entries),
		))
	}
	return strings.Join(lines, "\n")
}

func runGlobTool(ctx context.Context, root string, args globArgs) string {
	pattern := strings.TrimSpace(args.Pattern)
	if pattern == "" {
		return "glob failed: pattern is required."
	}
	start, err := resolveWorkspacePath(root, args.Path)
	if err != nil {
		return "glob failed: " + err.Error()
	}
	if _, err := os.Stat(start); err != nil {
		return "glob failed: path does not exist."
	}

	offset := args.Offset
	if offset < 0 {
		offset = 0
	}
	limit := clampToolLimit(args.Limit, defaultToolGlobEntries, maxToolGlobEntries)

	matches := []string{}
	matched := 0
	hasMore := false
	walkErr := filepath.WalkDir(start, func(path string, entry iofs.DirEntry, walkErr error) error {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if path == start {
				return nil
			}
			relPath, err := filepath.Rel(root, path)
			if err != nil {
				return filepath.SkipDir
			}
			if shouldSkipProjectContextDir(entry.Name()) ||
				shouldSkipProjectContextSegment(filepath.ToSlash(relPath)) {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		relPath = filepath.ToSlash(relPath)
		if shouldSkipProjectContextFile(entry.Name(), relPath) {
			return nil
		}
		if !axonfs.MatchGlob(pattern, relPath) {
			return nil
		}
		if matched < offset {
			matched++
			return nil
		}
		if len(matches) >= limit {
			hasMore = true
			return filepath.SkipAll
		}
		matches = append(matches, relPath)
		matched++
		return nil
	})
	if walkErr != nil && walkErr != filepath.SkipAll {
		return "glob failed: " + walkErr.Error()
	}
	if len(matches) == 0 {
		if offset > 0 && matched > 0 {
			return fmt.Sprintf("glob found no matches at offset %d for %q.", offset, pattern)
		}
		return fmt.Sprintf("glob found no files matching %q.", pattern)
	}

	scope := ""
	if strings.TrimSpace(args.Path) != "" {
		scope = " in " + filepath.ToSlash(strings.TrimSpace(args.Path))
	}
	lines := []string{fmt.Sprintf("glob results for %q%s:", pattern, scope)}
	lines = append(lines, matches...)
	if offset > 0 {
		lines = append(lines, fmt.Sprintf("Page starts at offset %d.", offset))
	}
	if hasMore {
		lines = append(lines, fmt.Sprintf(
			"More files available. Call glob with offset=%d for the next page.",
			offset+len(matches),
		))
	}
	return strings.Join(lines, "\n")
}

func runGrepTool(ctx context.Context, root string, args grepArgs) string {
	pattern := strings.TrimSpace(args.Pattern)
	if pattern == "" {
		return "grep failed: pattern is required."
	}
	target := root
	if strings.TrimSpace(args.Path) != "" {
		resolved, err := resolveWorkspacePath(root, args.Path)
		if err != nil {
			return "grep failed: " + err.Error()
		}
		if _, err := os.Stat(resolved); err != nil {
			return "grep failed: path does not exist."
		}
		target = resolved
	}

	globPattern := strings.TrimSpace(args.Glob)
	if strings.HasPrefix(globPattern, "!") {
		// The Go fallback only understands include globs. Rejecting exclusions
		// keeps ripgrep and the fallback from returning different result sets on
		// machines where rg is missing.
		return "grep failed: glob must be an include pattern."
	}
	offset := args.Offset
	if offset < 0 {
		offset = 0
	}
	limit := clampToolLimit(args.Limit, defaultToolGrepMatches, maxToolGrepMatches)

	// Ask for one more match than the page needs so the footer can tell the
	// model whether another page exists without running a second search.
	results, err := axonfs.SearchWorkspaceOptions(ctx, root, axonfs.SearchOptions{
		Pattern:       pattern,
		Regex:         !args.FixedStrings,
		CaseSensitive: args.CaseSensitive,
		Glob:          globPattern,
		TargetPath:    target,
		MaxResults:    offset + limit + toolPageLookahead,
		StableOrder:   true,
	})
	if err != nil {
		return "grep failed: " + err.Error()
	}
	if len(results) == 0 {
		return "grep found no matches for: " + pattern
	}
	if offset >= len(results) {
		return fmt.Sprintf("grep found no matches at offset %d for: %s", offset, pattern)
	}

	page := results[offset:]
	hasMore := len(page) > limit
	if hasMore {
		page = page[:limit]
	}

	scope := ""
	if strings.TrimSpace(args.Path) != "" {
		scope = " in " + filepath.ToSlash(strings.TrimSpace(args.Path))
	}
	if globPattern != "" {
		scope += " matching " + globPattern
	}
	lines := []string{fmt.Sprintf("grep results for %q%s:", pattern, scope)}
	for _, result := range page {
		relPath, err := filepath.Rel(root, result.Path)
		if err != nil {
			continue
		}
		lines = append(lines, fmt.Sprintf(
			"%s:%d:%d: %s",
			filepath.ToSlash(relPath),
			result.Line,
			result.Column,
			result.Preview,
		))
	}
	if hasMore {
		lines = append(lines, fmt.Sprintf(
			"More matches available. Call grep with offset=%d for the next page.",
			offset+len(page),
		))
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

	offset := args.Offset
	if offset < 1 {
		offset = 1
	}
	limit := clampToolLimit(args.Limit, defaultToolReadLines, maxToolReadLines)

	file, err := os.Open(path)
	if err != nil {
		return "read_file failed: could not open file."
	}
	defer file.Close()

	sample := make([]byte, toolFileSampleBytes)
	sampleSize, _ := file.Read(sample)
	if sampleSize > 0 && (!utf8.Valid(sample[:sampleSize]) || looksBinary(sample[:sampleSize])) {
		return "read_file failed: file is not readable UTF-8 text."
	}
	if _, err := file.Seek(0, 0); err != nil {
		return "read_file failed: could not read file."
	}

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, toolFileReadBufferSize), maxToolReadFileBytes)
	var output strings.Builder
	lineNumber := 0
	written := 0
	hasMore := false

	for scanner.Scan() {
		lineNumber++
		if lineNumber < offset {
			continue
		}
		if written >= limit {
			hasMore = true
			break
		}
		line := strings.TrimSuffix(scanner.Text(), "\r")
		line = truncateToolLine(line, maxToolReadLineRunes)
		formatted := fmt.Sprintf("%d: %s", lineNumber, line)
		if output.Len() > 0 && output.Len()+1+len(formatted) > maxToolReadBytes {
			hasMore = true
			break
		}
		if output.Len() > 0 {
			output.WriteByte('\n')
		}
		output.WriteString(formatted)
		written++
	}
	if err := scanner.Err(); err != nil {
		return "read_file failed: " + err.Error()
	}
	if written == 0 {
		if lineNumber == 0 {
			return fmt.Sprintf("read_file result for %s:\n(empty file)", relPath)
		}
		return fmt.Sprintf(
			"read_file failed: offset %d is past the end of %s (%d lines).",
			offset,
			relPath,
			lineNumber,
		)
	}

	result := fmt.Sprintf(
		"read_file result for %s [lines %d-%d]:\n%s",
		relPath,
		offset,
		offset+written-1,
		output.String(),
	)
	if hasMore {
		result += fmt.Sprintf(
			"\n[truncated; call read_file with offset=%d to continue]",
			offset+written,
		)
	}
	return result
}

func runSearchProjectTool(ctx context.Context, root string, args searchProjectArgs) string {
	return runGrepTool(ctx, root, grepArgs{
		Pattern:      args.Query,
		FixedStrings: true,
		Limit:        maxToolSearchMatches,
	})
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

func clampToolLimit(value int, defaultValue int, maxValue int) int {
	if value <= 0 {
		return defaultValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

// truncateToolLine protects the fixed response budget from a minified source
// line that would otherwise consume the entire read_file allowance in one hit.
// Runes, not bytes, so the returned text is still valid UTF-8 for the model.
func truncateToolLine(line string, limit int) string {
	runes := []rune(line)
	if len(runes) <= limit {
		return line
	}
	return string(runes[:limit]) + "..."
}
