// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package fs

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	ripgrepJSONBufferSize    = 8 * 1024 * 1024
	ripgrepReadBufferSize    = 64 * 1024
	maxSearchFileBytes       = 1024 * 1024
	searchFileSampleBytes    = 8192
	searchFileReadBufferSize = 1024
	defaultSearchResultLimit = 100
)

var (
	errSearchLimitReached = errors.New("search result limit reached")
	resolveRipgrepPath    = exec.LookPath
)

// SearchResult is a single workspace text match.
// The renderer needs the exact file, line, and column so selecting a result can
// open the file and place Monaco at the matching source location.
type SearchResult struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Preview string `json:"preview"`
}

// SearchOptions describes one workspace search. The editor's file search uses
// fixed strings and ignores case, while the agent's grep tool needs regex,
// case sensitivity, a file glob, and a target file or folder. Keeping both
// callers on one implementation prevents the agent from drifting into a weaker
// search than the rest of the editor.
type SearchOptions struct {
	Pattern       string
	Regex         bool
	CaseSensitive bool
	Glob          string
	TargetPath    string
	MaxResults    int
	// StableOrder forces path-sorted ripgrep output. The agent paginates with
	// offsets across separate searches, so a parallel walk that changes order
	// between calls would skip or duplicate matches. Editor search leaves this
	// off because it displays one response and values speed more.
	StableOrder bool
}

type ripgrepText struct {
	Text  *string `json:"text"`
	Bytes *string `json:"bytes"`
}

type ripgrepSubmatch struct {
	Start int `json:"start"`
}

type ripgrepEvent struct {
	Type string `json:"type"`
	Data struct {
		Path       ripgrepText       `json:"path"`
		Lines      ripgrepText       `json:"lines"`
		LineNumber int               `json:"line_number"`
		Submatches []ripgrepSubmatch `json:"submatches"`
	} `json:"data"`
}

// SearchWorkspace keeps the non-HTTP entry point useful for tests and callers
// that do not own a cancellation context.
func SearchWorkspace(rootPath string, query string, maxResults int) ([]SearchResult, error) {
	return SearchWorkspaceContext(context.Background(), rootPath, query, maxResults)
}

// SearchWorkspaceContext preserves the editor's original search contract:
// literal text, case-insensitive, across the whole workspace. The agent uses
// SearchWorkspaceOptions directly for regex and scoped searches.
func SearchWorkspaceContext(ctx context.Context, rootPath string, query string, maxResults int) ([]SearchResult, error) {
	return SearchWorkspaceOptions(ctx, rootPath, SearchOptions{
		Pattern:    query,
		Regex:      false,
		TargetPath: rootPath,
		MaxResults: maxResults,
	})
}

// SearchWorkspaceOptions prefers ripgrep because its parallel filesystem walk,
// memory mapping, and binary detection are substantially faster than opening
// every project file in Go. The subprocess inherits the request context, so a
// superseded renderer query kills the old search instead of leaving it to fight
// the editor and language servers for disk and CPU.
//
// ripgrep is intentionally optional. Axon still opens and searches normally on
// machines where rg is absent, and an operational ripgrep failure falls back to
// the proven Go walker rather than turning a local tool issue into broken search.
func SearchWorkspaceOptions(ctx context.Context, rootPath string, options SearchOptions) ([]SearchResult, error) {
	if options.MaxResults <= 0 {
		options.MaxResults = defaultSearchResultLimit
	}
	options.Pattern = strings.TrimSpace(options.Pattern)
	options.Glob = strings.TrimSpace(options.Glob)
	if options.Pattern == "" {
		return []SearchResult{}, nil
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	targetPath, targetRelative, err := resolveSearchTarget(rootPath, options.TargetPath)
	if err != nil {
		return nil, err
	}
	if options.TargetPath == "" {
		options.TargetPath = rootPath
	}
	if options.Glob != "" {
		if info, statErr := os.Stat(targetPath); statErr == nil && !info.IsDir() &&
			!MatchGlob(options.Glob, targetRelative) {
			return []SearchResult{}, nil
		}
	}

	results, err := searchWorkspaceWithRipgrepOptions(ctx, rootPath, options, targetRelative)
	if err == nil {
		return results, nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}

	return searchWorkspaceWithWalkerOptions(ctx, rootPath, options, targetPath)
}

func resolveSearchTarget(rootPath string, targetPath string) (string, string, error) {
	root, err := filepath.Abs(rootPath)
	if err != nil {
		return "", "", err
	}
	target := strings.TrimSpace(targetPath)
	if target == "" {
		target = root
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(root, target)
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return "", "", err
	}
	relativePath, err := filepath.Rel(root, target)
	if err != nil {
		return "", "", err
	}
	if relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)) {
		return "", "", errors.New("search path must stay inside the workspace")
	}
	if _, err := os.Stat(target); err != nil {
		return "", "", fmt.Errorf("search path is not available: %w", err)
	}
	relativePath = filepath.ToSlash(relativePath)
	if relativePath == "" {
		relativePath = "."
	}
	return target, relativePath, nil
}

func searchWorkspaceWithRipgrep(ctx context.Context, rootPath string, query string, maxResults int) ([]SearchResult, error) {
	return searchWorkspaceWithRipgrepOptions(ctx, rootPath, SearchOptions{
		Pattern:    query,
		TargetPath: rootPath,
		MaxResults: maxResults,
	}, ".")
}

func searchWorkspaceWithRipgrepOptions(ctx context.Context, rootPath string, options SearchOptions, target string) ([]SearchResult, error) {
	if options.MaxResults <= 0 {
		options.MaxResults = defaultSearchResultLimit
	}
	ripgrepPath, err := resolveRipgrepPath("rg")
	if err != nil {
		return nil, err
	}

	searchCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	command := exec.CommandContext(searchCtx, ripgrepPath, ripgrepOptionsArguments(options, target)...)
	command.Dir = rootPath
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := command.Start(); err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, options.MaxResults)
	reachedLimit := false
	var parseErr error
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, ripgrepReadBufferSize), ripgrepJSONBufferSize)
	for scanner.Scan() {
		result, matched, err := parseRipgrepMatch(rootPath, scanner.Bytes())
		if err != nil {
			parseErr = err
			cancel()
			break
		}
		if !matched ||
			shouldSkipSearchPath(rootPath, result.Path) ||
			shouldSkipSearchFile(result.Path) ||
			isInsidePythonVirtualEnvironment(rootPath, result.Path) {
			continue
		}

		results = append(results, result)
		if len(results) >= options.MaxResults {
			// The agent asks for offset+limit+1 results so this cap doubles as
			// its "another page exists" signal. Editor search uses the same cap
			// as a display limit. Killing rg here prevents a large repository
			// scan from continuing invisibly after the useful set is assembled.
			reachedLimit = true
			cancel()
			break
		}
	}

	scanErr := scanner.Err()
	waitErr := command.Wait()
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if reachedLimit {
		return results, nil
	}
	if parseErr != nil {
		return nil, parseErr
	}
	if scanErr != nil {
		return nil, scanErr
	}
	if waitErr == nil {
		return results, nil
	}

	var exitErr *exec.ExitError
	if errors.As(waitErr, &exitErr) && exitErr.ExitCode() == 1 {
		// ripgrep reserves exit code 1 for a valid search with no matches.
		return results, nil
	}
	return nil, fmt.Errorf("ripgrep search failed: %w", waitErr)
}

func ripgrepArguments(query string) []string {
	return ripgrepOptionsArguments(SearchOptions{Pattern: query}, ".")
}

func ripgrepOptionsArguments(options SearchOptions, target string) []string {
	arguments := []string{"--json"}
	if !options.Regex {
		arguments = append(arguments, "--fixed-strings")
	}
	if !options.CaseSensitive {
		arguments = append(arguments, "--ignore-case")
	}
	arguments = append(arguments, "--hidden", "--no-config", "--max-filesize", "1M")
	if options.StableOrder {
		arguments = append(arguments, "--sort", "path")
	}
	if options.Glob != "" {
		arguments = append(arguments, "--glob", options.Glob)
	}

	// These globs prevent ripgrep from entering the same generated trees that
	// the Go fallback excludes. The result parser repeats Axon's path checks as a
	// trust boundary, while the globs avoid paying the I/O cost in the first place.
	for _, directory := range []string{
		".git", "node_modules", "vendor", "dist", "release", "build", "out", "target",
		"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".venv", "venv", "env",
		".gradle", ".next", ".turbo", ".parcel-cache", ".cache", ".gocache", "gocache", "go-build",
		"bin", "obj", "coverage", "coverage-final", "tmp", "temp",
	} {
		arguments = append(arguments, "--glob", "!**/"+directory+"/**")
	}
	for _, pattern := range []string{".cache*", "cache*", "*-cache", "go-build*", "*gocache*"} {
		arguments = append(arguments, "--glob", "!**/"+pattern+"/**")
	}

	if target == "" {
		target = "."
	}
	return append(arguments, "--", options.Pattern, target)
}

func parseRipgrepMatch(rootPath string, rawEvent []byte) (SearchResult, bool, error) {
	var event ripgrepEvent
	if err := json.Unmarshal(rawEvent, &event); err != nil {
		return SearchResult{}, false, fmt.Errorf("decode ripgrep event: %w", err)
	}
	if event.Type != "match" || len(event.Data.Submatches) == 0 {
		return SearchResult{}, false, nil
	}

	relativePath, err := event.Data.Path.value()
	if err != nil {
		return SearchResult{}, false, err
	}
	line, err := event.Data.Lines.value()
	if err != nil {
		return SearchResult{}, false, err
	}

	resultPath := filepath.Clean(filepath.Join(rootPath, filepath.FromSlash(relativePath)))
	workspaceRelativePath, err := filepath.Rel(rootPath, resultPath)
	if err != nil || workspaceRelativePath == ".." || strings.HasPrefix(workspaceRelativePath, ".."+string(os.PathSeparator)) {
		return SearchResult{}, false, fmt.Errorf("ripgrep returned a path outside the workspace: %q", relativePath)
	}

	return SearchResult{
		Path:    resultPath,
		Line:    event.Data.LineNumber,
		Column:  event.Data.Submatches[0].Start + 1,
		Preview: trimSearchPreview(strings.TrimSuffix(line, "\n")),
	}, true, nil
}

func (value ripgrepText) value() (string, error) {
	if value.Text != nil {
		return *value.Text, nil
	}
	if value.Bytes == nil {
		return "", errors.New("ripgrep event is missing text content")
	}

	decoded, err := base64.StdEncoding.DecodeString(*value.Bytes)
	if err != nil {
		return "", fmt.Errorf("decode ripgrep byte content: %w", err)
	}
	return string(decoded), nil
}

func isInsidePythonVirtualEnvironment(rootPath string, candidatePath string) bool {
	workspaceRoot := filepath.Clean(rootPath)
	currentDirectory := filepath.Dir(filepath.Clean(candidatePath))
	for currentDirectory != workspaceRoot {
		relativePath, err := filepath.Rel(workspaceRoot, currentDirectory)
		if err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)) {
			return false
		}

		// pyvenv.cfg is created by Python's venv machinery at the environment
		// root. Detecting the marker avoids guessing names such as .venv or env,
		// so a workspace-specific name cannot make search index installed Python
		// packages as project source.
		if info, err := os.Stat(filepath.Join(currentDirectory, "pyvenv.cfg")); err == nil && !info.IsDir() {
			return true
		}

		parentDirectory := filepath.Dir(currentDirectory)
		if parentDirectory == currentDirectory {
			return false
		}
		currentDirectory = parentDirectory
	}

	return false
}

func searchWorkspaceWithWalker(ctx context.Context, rootPath string, normalizedQuery string, maxResults int) ([]SearchResult, error) {
	return searchWorkspaceWithWalkerOptions(ctx, rootPath, SearchOptions{
		Pattern:    normalizedQuery,
		TargetPath: rootPath,
		MaxResults: maxResults,
	}, rootPath)
}

func searchWorkspaceWithWalkerOptions(ctx context.Context, rootPath string, options SearchOptions, targetPath string) ([]SearchResult, error) {
	if options.MaxResults <= 0 {
		options.MaxResults = defaultSearchResultLimit
	}
	expression, err := compileSearchExpression(options)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(targetPath)
	if err != nil {
		return nil, fmt.Errorf("search path is not available: %w", err)
	}
	if !info.IsDir() {
		if shouldSkipSearchPath(rootPath, targetPath) ||
			shouldSkipSearchFile(targetPath) ||
			isInsidePythonVirtualEnvironment(rootPath, targetPath) {
			return []SearchResult{}, nil
		}
		results := []SearchResult{}
		err := searchFileWithOptions(ctx, targetPath, options, expression, &results)
		if errors.Is(err, errSearchLimitReached) {
			return results, nil
		}
		return results, err
	}

	results := []SearchResult{}
	err = filepath.WalkDir(targetPath, func(path string, entry os.DirEntry, walkErr error) error {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		if len(results) >= options.MaxResults {
			return errSearchLimitReached
		}
		if walkErr != nil {
			return nil
		}

		if path != rootPath && shouldSkipSearchPath(rootPath, path) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() {
			if path != rootPath {
				if info, markerErr := os.Stat(filepath.Join(path, "pyvenv.cfg")); markerErr == nil && !info.IsDir() {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if shouldSkipSearchFile(path) {
			return nil
		}
		relativePath, err := filepath.Rel(rootPath, path)
		if err != nil {
			return nil
		}
		if options.Glob != "" && !MatchGlob(options.Glob, filepath.ToSlash(relativePath)) {
			return nil
		}

		return searchFileWithOptions(ctx, path, options, expression, &results)
	})
	if errors.Is(err, errSearchLimitReached) {
		return results, nil
	}

	return results, err
}

func compileSearchExpression(options SearchOptions) (*regexp.Regexp, error) {
	if !options.Regex {
		return nil, nil
	}
	pattern := options.Pattern
	if !options.CaseSensitive {
		pattern = "(?i)" + pattern
	}
	return regexp.Compile(pattern)
}

func searchFileWithOptions(
	ctx context.Context,
	path string,
	options SearchOptions,
	expression *regexp.Regexp,
	results *[]SearchResult,
) error {
	info, err := os.Stat(path)
	if err != nil || info.Size() > maxSearchFileBytes {
		return nil
	}

	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	sample := make([]byte, searchFileSampleBytes)
	sampleSize, sampleErr := file.Read(sample)
	if sampleErr != nil && sampleSize == 0 {
		return nil
	}
	if isBinaryContent(sample[:sampleSize]) {
		return nil
	}
	if _, err := file.Seek(0, 0); err != nil {
		return nil
	}

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, searchFileReadBufferSize), maxSearchFileBytes)
	lineNumber := 0
	for scanner.Scan() {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		lineNumber++
		line := scanner.Text()
		column := searchColumn(line, options, expression)
		if column < 0 {
			continue
		}

		*results = append(*results, SearchResult{
			Path:    path,
			Line:    lineNumber,
			Column:  column + 1,
			Preview: trimSearchPreview(line),
		})
		if len(*results) >= options.MaxResults {
			return errSearchLimitReached
		}
	}

	return nil
}

func searchColumn(line string, options SearchOptions, expression *regexp.Regexp) int {
	if options.Regex {
		if expression == nil {
			return -1
		}
		match := expression.FindStringIndex(line)
		if match == nil {
			return -1
		}
		return match[0]
	}

	if options.CaseSensitive {
		return strings.Index(line, options.Pattern)
	}
	return strings.Index(strings.ToLower(line), strings.ToLower(options.Pattern))
}
