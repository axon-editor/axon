package ai

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	maxProjectContextFiles       = 70
	maxProjectContextBytes       = 60000
	maxProjectContextFileBytes   = 8000
	maxProjectContextTreeEntries = 1500
	bytesPerToken                = 3
	maxProjectContextTokens      = 6000
)

type ProjectContextFile struct {
	Path       string `json:"path"`
	Content    string `json:"content"`
	LanguageID string `json:"languageId"`
	Size       int64  `json:"size"`
	Truncated  bool   `json:"truncated"`
}

type ProjectContext struct {
	Root          string               `json:"root"`
	Tree          []string             `json:"tree"`
	Files         []ProjectContextFile `json:"files"`
	TotalFiles    int                  `json:"totalFiles"`
	IncludedFiles int                  `json:"includedFiles"`
	SkippedFiles  int                  `json:"skippedFiles"`
	Truncated     bool                 `json:"truncated"`
}

type projectContextCandidate struct {
	path     string
	relPath  string
	info     fs.FileInfo
	priority int
}

// BuildProjectContext creates the repository snapshot that Ask Axon sends to
// the local model before a chat request. The goal is to give the model the
// same project awareness a serious editor needs: a workspace tree plus the
// highest-value source, config, and documentation files.
//
// The final payload is still capped because local models have real context
// windows even when there is no API bill. Without these limits, generated
// folders, caches, lockfiles, or binaries can push useful code out of the
// prompt and make answers worse while also making the editor feel slow.
func BuildProjectContext(ctx context.Context, root string) (ProjectContext, error) {
	cleanRoot, err := validateProjectContextRoot(root)
	if err != nil {
		return ProjectContext{}, err
	}

	contextPack := ProjectContext{
		Root:  cleanRoot,
		Tree:  []string{},
		Files: []ProjectContextFile{},
	}
	candidates := []projectContextCandidate{}

	err = filepath.WalkDir(cleanRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if walkErr != nil {
			contextPack.SkippedFiles++
			if entry != nil && entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if path == cleanRoot {
			return nil
		}

		relPath, err := filepath.Rel(cleanRoot, path)
		if err != nil {
			contextPack.SkippedFiles++
			return nil
		}
		relPath = filepath.ToSlash(relPath)

		if entry.IsDir() {
			if shouldSkipProjectContextDir(entry.Name()) || shouldSkipProjectContextSegment(relPath) {
				return filepath.SkipDir
			}
			if len(contextPack.Tree) < maxProjectContextTreeEntries {
				contextPack.Tree = append(contextPack.Tree, relPath+"/")
			} else {
				contextPack.Truncated = true
			}
			return nil
		}

		contextPack.TotalFiles++
		if len(contextPack.Tree) < maxProjectContextTreeEntries {
			contextPack.Tree = append(contextPack.Tree, relPath)
		} else {
			contextPack.Truncated = true
		}
		if shouldSkipProjectContextFile(entry.Name(), relPath) {
			contextPack.SkippedFiles++
			return nil
		}

		info, err := entry.Info()
		if err != nil {
			contextPack.SkippedFiles++
			return nil
		}
		candidates = append(candidates, projectContextCandidate{
			path:     path,
			relPath:  relPath,
			info:     info,
			priority: projectContextPriority(relPath),
		})
		return nil
	})
	if err != nil {
		return ProjectContext{}, err
	}

	sort.SliceStable(candidates, func(left, right int) bool {
		if candidates[left].priority != candidates[right].priority {
			return candidates[left].priority > candidates[right].priority
		}
		return candidates[left].relPath < candidates[right].relPath
	})
	sort.Strings(contextPack.Tree)

	usedBytes := 0
	for _, candidate := range candidates {
		if len(contextPack.Files) >= maxProjectContextFiles || usedBytes >= maxProjectContextBytes {
			contextPack.Truncated = true
			contextPack.SkippedFiles++
			continue
		}

		content, truncated, ok := readProjectContextFile(candidate.path, candidate.info.Size(), maxProjectContextFileBytes)
		if !ok {
			contextPack.SkippedFiles++
			continue
		}
		remainingBytes := maxProjectContextBytes - usedBytes
		if len(content) > remainingBytes {
			content = content[:remainingBytes]
			truncated = true
			contextPack.Truncated = true
		}

		contextPack.Files = append(contextPack.Files, ProjectContextFile{
			Path:       candidate.relPath,
			Content:    content,
			LanguageID: languageIDForProjectContext(candidate.relPath),
			Size:       candidate.info.Size(),
			Truncated:  truncated,
		})
		usedBytes += len(content)
	}

	contextPack.IncludedFiles = len(contextPack.Files)
	return contextPack, nil
}

func trimProjectContextToTokenBudget(contextPack *ProjectContext, maxTokens int) {
	if contextPack == nil {
		return
	}
	// This intentionally mutates the request-owned context pack before prompt
	// assembly. The caller has already attached the snapshot to a single chat
	// request, and trimming in place avoids carrying a second copy of large file
	// contents while making IncludedFiles/SkippedFiles match what the model
	// actually receives.
	budget := maxTokens * bytesPerToken
	used := 0
	kept := contextPack.Files[:0]
	for _, file := range contextPack.Files {
		if used+len(file.Content) > budget {
			contextPack.Truncated = true
			contextPack.SkippedFiles++
			continue
		}
		used += len(file.Content)
		kept = append(kept, file)
	}
	contextPack.Files = kept
	contextPack.IncludedFiles = len(kept)
}

// validateProjectContextRoot rejects missing or stale workspaces before the
// walker starts. This keeps broken sessions and deleted folders from turning
// into noisy filesystem errors inside the chat UI.
func validateProjectContextRoot(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", UserError{
			Field:   "folderPath",
			Code:    "WORKSPACE_REQUIRED",
			Message: "Open a workspace before asking Axon about the project.",
		}
	}
	cleanRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(cleanRoot)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", UserError{
				Field:   "folderPath",
				Code:    "WORKSPACE_NOT_FOUND",
				Message: "The workspace folder no longer exists.",
			}
		}
		return "", err
	}
	if !info.IsDir() {
		return "", UserError{
			Field:   "folderPath",
			Code:    "WORKSPACE_NOT_DIRECTORY",
			Message: "The selected workspace is not a folder.",
		}
	}
	return cleanRoot, nil
}

// readProjectContextFile reads only files that are safe and useful to place in
// a model prompt. UTF-8 and binary checks matter here because image archives,
// databases, and compiled outputs can look like normal files to the walker but
// become garbage tokens once they are sent to the model.
func readProjectContextFile(path string, size int64, limit int) (string, bool, bool) {
	if size <= 0 {
		return "", false, true
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", false, false
	}
	truncated := len(raw) > limit
	if truncated {
		raw = raw[:limit]
	}
	if !utf8.Valid(raw) || looksBinary(raw) {
		return "", false, false
	}
	return string(raw), truncated, true
}

func shouldSkipProjectContextDir(name string) bool {
	switch strings.ToLower(name) {
	case ".git", ".hg", ".svn", ".idea", ".vscode", ".next", ".nuxt", ".svelte-kit",
		".astro", ".turbo", ".cache", ".parcel-cache", ".gradle", ".go-cache", ".gocache",
		"node_modules", "vendor", "dist", "build", "out", "release", "coverage",
		"target", "bin", "obj", "debug", "tmp", "temp", "__pycache__", ".pytest_cache",
		".mypy_cache", ".ruff_cache", ".tox", ".venv", "venv", "env", ".eggs",
		"Pods", "DerivedData", ".dart_tool", ".pub-cache", ".stack-work":
		return true
	default:
		return false
	}
}

func shouldSkipProjectContextSegment(relPath string) bool {
	for _, segment := range strings.Split(relPath, "/") {
		if shouldSkipProjectContextDir(segment) {
			return true
		}
	}
	return false
}

func shouldSkipProjectContextFile(name string, relPath string) bool {
	lowerName := strings.ToLower(name)
	lowerPath := strings.ToLower(relPath)
	if strings.HasSuffix(lowerName, ".min.js") || strings.HasSuffix(lowerName, ".min.css") {
		return true
	}
	switch lowerName {
	case ".ds_store", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
		"cargo.lock", "go.sum", "composer.lock", "poetry.lock", "uv.lock":
		return true
	}
	blockedExt := map[string]bool{
		".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true, ".avif": true,
		".ico": true, ".icns": true, ".pdf": true, ".zip": true, ".gz": true, ".tar": true,
		".rar": true, ".7z": true, ".dmg": true, ".mp4": true, ".mov": true, ".mp3": true,
		".wav": true, ".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".map": true,
		".sqlite": true, ".db": true, ".exe": true, ".dll": true, ".so": true, ".dylib": true,
	}
	if blockedExt[filepath.Ext(lowerPath)] {
		return true
	}
	return shouldSkipProjectContextSegment(relPath)
}

func projectContextPriority(relPath string) int {
	lower := strings.ToLower(relPath)
	switch filepath.Base(lower) {
	case "readme.md", "package.json", "tsconfig.json", "vite.config.ts", "electron.vite.config.ts",
		"go.mod", "cargo.toml", "pyproject.toml", "requirements.txt", "gemfile", "composer.json":
		return 100
	}
	switch filepath.Ext(lower) {
	case ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".py", ".java", ".kt", ".swift",
		".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".php", ".rb", ".vue", ".svelte":
		return 90
	case ".json", ".yaml", ".yml", ".toml", ".graphql", ".proto":
		return 75
	case ".md", ".mdx", ".txt":
		return 60
	case ".css", ".scss", ".html":
		return 55
	default:
		return 25
	}
}

func languageIDForProjectContext(relPath string) string {
	switch strings.ToLower(filepath.Ext(relPath)) {
	case ".tsx":
		return "typescriptreact"
	case ".ts":
		return "typescript"
	case ".jsx":
		return "javascriptreact"
	case ".js":
		return "javascript"
	case ".go":
		return "go"
	case ".rs":
		return "rust"
	case ".py":
		return "python"
	case ".md", ".mdx":
		return "markdown"
	case ".json":
		return "json"
	case ".css", ".scss":
		return "css"
	case ".html":
		return "html"
	case ".yaml", ".yml":
		return "yaml"
	default:
		return strings.TrimPrefix(filepath.Ext(relPath), ".")
	}
}

func looksBinary(raw []byte) bool {
	if len(raw) == 0 {
		return false
	}
	if bytes.IndexByte(raw, 0) >= 0 {
		return true
	}
	nonText := 0
	for _, value := range raw {
		if value < 7 || (value > 14 && value < 32) {
			nonText++
		}
	}
	return nonText > len(raw)/20
}
