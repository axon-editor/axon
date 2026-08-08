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
	"strings"
)

const ripgrepJSONBufferSize = 8 * 1024 * 1024

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

// SearchWorkspaceContext prefers ripgrep because its parallel filesystem walk,
// memory mapping, and binary detection are substantially faster than opening
// every project file in Go. The subprocess inherits the request context, so a
// superseded renderer query kills the old search instead of leaving it to fight
// the editor and language servers for disk and CPU.
//
// ripgrep is intentionally optional. Axon still opens and searches normally on
// machines where rg is absent, and an operational ripgrep failure falls back to
// the proven Go walker rather than turning a local tool issue into broken search.
func SearchWorkspaceContext(ctx context.Context, rootPath string, query string, maxResults int) ([]SearchResult, error) {
	if maxResults <= 0 {
		maxResults = 100
	}

	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		return []SearchResult{}, nil
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	results, err := searchWorkspaceWithRipgrep(ctx, rootPath, normalizedQuery, maxResults)
	if err == nil {
		return results, nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}

	return searchWorkspaceWithWalker(ctx, rootPath, normalizedQuery, maxResults)
}

func searchWorkspaceWithRipgrep(ctx context.Context, rootPath string, query string, maxResults int) ([]SearchResult, error) {
	ripgrepPath, err := resolveRipgrepPath("rg")
	if err != nil {
		return nil, err
	}

	searchCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	command := exec.CommandContext(searchCtx, ripgrepPath, ripgrepArguments(query)...)
	command.Dir = rootPath
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := command.Start(); err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, maxResults)
	reachedLimit := false
	var parseErr error
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), ripgrepJSONBufferSize)
	for scanner.Scan() {
		result, matched, err := parseRipgrepMatch(rootPath, scanner.Bytes())
		if err != nil {
			parseErr = err
			cancel()
			break
		}
		if !matched || shouldSkipSearchPath(rootPath, result.Path) || shouldSkipSearchFile(result.Path) {
			continue
		}

		results = append(results, result)
		if len(results) >= maxResults {
			// The HTTP response cannot display additional matches. Killing rg at
			// the cap prevents a large repository scan from continuing invisibly
			// after the useful result set has already been assembled.
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
	arguments := []string{
		"--json",
		"--fixed-strings",
		"--ignore-case",
		"--hidden",
		"--no-ignore",
		"--no-config",
		"--max-filesize", "1M",
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

	return append(arguments, "--", query, ".")
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

func searchWorkspaceWithWalker(ctx context.Context, rootPath string, normalizedQuery string, maxResults int) ([]SearchResult, error) {
	results := []SearchResult{}
	err := filepath.WalkDir(rootPath, func(path string, entry os.DirEntry, err error) error {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		if len(results) >= maxResults {
			return errSearchLimitReached
		}
		if err != nil {
			return nil
		}

		if path != rootPath && shouldSkipSearchPath(rootPath, path) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() || shouldSkipSearchFile(path) {
			return nil
		}

		info, err := entry.Info()
		if err != nil || info.Size() > 1024*1024 {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()

		sample := make([]byte, 8192)
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
		scanner.Buffer(make([]byte, 1024), 1024*1024)
		lineNumber := 0
		for scanner.Scan() {
			lineNumber++
			line := scanner.Text()
			column := strings.Index(strings.ToLower(line), normalizedQuery)
			if column < 0 {
				continue
			}

			results = append(results, SearchResult{
				Path:    path,
				Line:    lineNumber,
				Column:  column + 1,
				Preview: trimSearchPreview(line),
			})
			if len(results) >= maxResults {
				return errSearchLimitReached
			}
		}

		return nil
	})
	if errors.Is(err, errSearchLimitReached) {
		return results, nil
	}

	return results, err
}
