// Handles all file system operations for Axon, reading directory trees,
// reading file contents, and writing file contents.
// This package is intentionally pure (no HTTP concerns), it only deals
// with the file system and returns Go structs. The server layer handles
// serialization and HTTP responses.
package fs

import (
	"bufio"
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

// FileNode represents a single node in the file system tree.
// If IsDir is true, Children will contain the directory's contents.
// Children is omitted from JSON when empty to keep the response clean.
type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"is_dir"`
	Children []FileNode `json:"children,omitempty"`
}

// FileContent holds the path and raw string content of a file.
// Content is returned as a string so Monaco can consume it directly.
type FileContent struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

var ErrBinaryFile = errors.New("binary files cannot be opened as text")
var errSearchLimitReached = errors.New("search result limit reached")

// SearchResult is a single workspace text match.
// The renderer needs the exact file, line, and column so selecting a result can
// become "open this file here" now and later "jump to this location" when the
// editor exposes line/column navigation.
type SearchResult struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Preview string `json:"preview"`
}

// ReplaceResult summarizes one workspace replace operation without returning
// every changed file body across the process boundary.
type ReplaceResult struct {
	FilesChanged int `json:"files_changed"`
	Replacements int `json:"replacements"`
}

func shouldSkipEntry(name string) bool {
	// Dotfiles and dependency/build folders are real project entries in an
	// editor. Axon must show entries like .github, .gitignore, node_modules,
	// dist, and release because the user may need to inspect or edit them just
	// like they would in Zed or VS Code. The only entries skipped from the tree
	// are platform/VCS metadata that would add noise without being useful as
	// normal editable project content.
	switch name {
	case ".git", ".DS_Store":
		return true
	default:
		return false
	}
}

func shouldSkipSearchEntry(name string) bool {
	// Search needs a broader ignore list than the visible tree because the
	// walker would otherwise burn time scanning generated output, dependency
	// installs, and language caches from every ecosystem the user might open.
	// Those directories are usually enormous, rarely contain hand-written code,
	// and create noisy duplicate matches that bury the actual source hit. By
	// skipping them here, Axon keeps search fast and focused without hiding the
	// same folders from the explorer.
	lowerName := strings.ToLower(name)
	switch lowerName {
	case ".git", ".ds_store":
		return true
	case "node_modules", "vendor", "dist", "release", "build", "out", "target":
		return true
	case "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".venv", "venv", "env":
		return true
	case ".gradle", ".next", ".turbo", ".parcel-cache", ".cache", ".gocache", "gocache", "go-build":
		return true
	case "bin", "obj", "coverage", "coverage-final", "tmp", "temp":
		return true
	default:
		return strings.HasPrefix(lowerName, ".cache") ||
			strings.HasPrefix(lowerName, "cache") ||
			strings.HasPrefix(lowerName, "go-build") ||
			strings.Contains(lowerName, "gocache") ||
			strings.HasSuffix(lowerName, "-cache")
	}
}

func shouldSkipSearchPath(rootPath string, candidatePath string) bool {
	relativePath, err := filepath.Rel(rootPath, candidatePath)
	if err != nil || relativePath == "." {
		return false
	}

	// Check every segment, not only the current WalkDir entry name. Generated
	// cache folders can contain thousands of nested files, and path-level
	// filtering guarantees anything already below .gocache/go-build never gets
	// opened or returned as a search hit.
	for _, segment := range strings.Split(relativePath, string(os.PathSeparator)) {
		if shouldSkipSearchEntry(segment) {
			return true
		}
	}

	return false
}

func shouldSkipSearchFile(path string) bool {
	// The text searcher should be ruthless about files that cannot produce a
	// useful source-code hit. Checking the extension before opening the file is
	// much cheaper than sampling content from images, archives, videos, fonts,
	// executables, and generated maps. This keeps search responsive in normal
	// projects while still allowing extensionless text files to be scanned.
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns", ".bmp", ".tiff", ".avif":
		return true
	case ".mp4", ".mov", ".webm", ".m4v", ".mp3", ".wav", ".ogg", ".flac":
		return true
	case ".zip", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".7z", ".rar":
		return true
	case ".pdf", ".wasm", ".bin", ".exe", ".dll", ".dylib", ".so", ".a", ".o":
		return true
	case ".ttf", ".otf", ".woff", ".woff2", ".eot":
		return true
	case ".lock", ".map":
		return true
	default:
		return false
	}
}

func trimSearchPreview(line string) string {
	preview := strings.TrimSpace(line)
	runes := []rune(preview)
	if len(runes) <= 220 {
		return preview
	}

	return string(runes[:220])
}

func isBinaryContent(data []byte) bool {
	if len(data) == 0 {
		return false
	}

	sampleSize := len(data)
	if sampleSize > 8192 {
		sampleSize = 8192
	}
	sample := data[:sampleSize]

	if len(sample) >= 3 && sample[0] == 0xef && sample[1] == 0xbb && sample[2] == 0xbf {
		sample = sample[3:]
	}

	for _, value := range sample {
		if value == 0 {
			return true
		}
	}

	return !utf8.Valid(sample)
}

// GetTree reads one directory level and builds a FileNode tree.
//
// I keep this shallow on purpose because the renderer now expands folders
// lazily. That avoids doing a full recursive walk every time a workspace is
// selected, which used to "open" the entire tree up front and made large
// projects slower to fetch than they needed to be.
//
// If a child entry fails to read (permissions etc), it is silently skipped
// rather than failing the entire tree, partial tree is better than nothing.
func GetTree(rootPath string) (FileNode, error) {
	info, err := os.Stat(rootPath)
	if err != nil {
		// path doesn't exist or isn't accessible
		return FileNode{}, err
	}

	node := FileNode{
		Name:  info.Name(),
		Path:  rootPath,
		IsDir: info.IsDir(),
	}

	// If this is a file (not a directory), return immediately — there are no
	// children to walk and the renderer only needs the leaf node metadata.
	if !info.IsDir() {
		return node, nil
	}

	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return FileNode{}, err
	}

	// Separate directories and files so the sidebar can keep folder names above
	// files while still preserving alphabetical order inside each group.
	var dirs []os.DirEntry
	var files []os.DirEntry

	for _, entry := range entries {
		if shouldSkipEntry(entry.Name()) {
			continue
		}

		if entry.IsDir() {
			dirs = append(dirs, entry)
		} else {
			files = append(files, entry)
		}
	}

	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name()) < strings.ToLower(dirs[j].Name())
	})

	sort.Slice(files, func(i, j int) bool {
		return strings.ToLower(files[i].Name()) < strings.ToLower(files[j].Name())
	})

	// The renderer expands directories on demand, so I only return the direct
	// children here. That keeps workspace fetches cheap and avoids paying the
	// cost of walking every nested folder before the user has asked to see it.
	for _, entry := range append(dirs, files...) {
		childPath := filepath.Join(rootPath, entry.Name())
		childInfo, err := entry.Info()
		if err != nil {
			continue
		}

		child := FileNode{
			Name:  entry.Name(),
			Path:  childPath,
			IsDir: childInfo.IsDir(),
		}

		node.Children = append(node.Children, child)
	}

	return node, nil
}

// ReadFile reads the full contents of a text file at the given path and returns
// it as a FileContent struct.
func ReadFile(path string) (FileContent, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return FileContent{}, err
	}
	if isBinaryContent(data) {
		// The editor should never try to push arbitrary binary bytes into Monaco.
		// NUL bytes and invalid UTF-8 are strong signals that the file belongs in
		// a media/download preview path instead of the text-model path. Returning
		// a specific error lets the HTTP layer explain the limitation clearly.
		return FileContent{}, ErrBinaryFile
	}

	return FileContent{
		Path:    path,
		Content: string(data),
	}, nil
}

// WriteFile writes content to the file at the given path.
// Creates the file if it doesn't exist, overwrites if it does.
// Uses 0644 permissions, owner read/write, group/others read only.
func WriteFile(path string, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
}

// MoveEntry moves a file or directory from sourcePath to targetDir.
// The entry keeps its original name in the new location.
// Uses os.Rename which is atomic on the same filesystem.
func MoveEntry(sourcePath string, targetDir string) error {
	name := filepath.Base(sourcePath)
	destPath := filepath.Join(targetDir, name)
	return os.Rename(sourcePath, destPath)
}

// RenameEntry renames a file or directory inside its current parent directory.
// I keep this separate from MoveEntry because a rename is a different user
// intent from dragging an entry to another folder: the parent stays fixed, only
// the final path segment changes. That lets the UI validate sibling names and
// avoids accidentally turning a rename operation into a cross-folder move.
func RenameEntry(sourcePath string, newName string) (string, error) {
	parentDir := filepath.Dir(sourcePath)
	destPath := filepath.Join(parentDir, newName)
	if sourcePath == destPath {
		return destPath, nil
	}

	if _, err := os.Stat(destPath); err == nil {
		return "", os.ErrExist
	} else if !os.IsNotExist(err) {
		return "", err
	}

	return destPath, os.Rename(sourcePath, destPath)
}

// SearchWorkspace walks the project tree and returns text matches for query.
// It intentionally skips the same noisy folders as GetTree so search feels
// aligned with what the user sees in the sidebar, and it caps large files to
// avoid freezing the local core process on generated bundles or binary assets.
func SearchWorkspace(rootPath string, query string, maxResults int) ([]SearchResult, error) {
	return SearchWorkspaceContext(context.Background(), rootPath, query, maxResults)
}

// SearchWorkspaceContext is the cancellable search path used by the HTTP
// server. Search queries are fired while the user is typing, so an older query
// must stop as soon as the renderer asks for a newer one. Without this context
// check, the core can keep walking a large workspace for a search result the UI
// will never display, which makes the next query feel slower than it should.
func SearchWorkspaceContext(ctx context.Context, rootPath string, query string, maxResults int) ([]SearchResult, error) {
	if maxResults <= 0 {
		maxResults = 100
	}

	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		return []SearchResult{}, nil
	}

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

		if entry.IsDir() {
			return nil
		}
		if shouldSkipSearchFile(path) {
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
		// The deferred close above still runs when this WalkDir callback
		// returns, including this seek-error branch. Keeping the close lifetime
		// tied to the callback avoids leaking descriptors while making the early
		// skip paths cheap and easy to follow.
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

// ReplaceWorkspaceContext performs one bounded filesystem walk in Core instead
// of making the renderer read and write every search result over IPC. Each file
// is replaced through a temporary sibling and rename, so a crash cannot leave a
// half-written source file even though a multi-file operation is not globally
// transactional.
func ReplaceWorkspaceContext(ctx context.Context, rootPath string, searchText string, replacement string) (ReplaceResult, error) {
	result := ReplaceResult{}
	if searchText == "" {
		return result, errors.New("search text is required")
	}

	err := filepath.WalkDir(rootPath, func(path string, entry os.DirEntry, walkErr error) error {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
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
		if entry.IsDir() || shouldSkipSearchFile(path) {
			return nil
		}

		info, infoErr := entry.Info()
		if infoErr != nil || info.Size() > 1024*1024 {
			return nil
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil || isBinaryContent(content) {
			return nil
		}
		matchCount := strings.Count(string(content), searchText)
		if matchCount == 0 {
			return nil
		}

		tempFile, createErr := os.CreateTemp(filepath.Dir(path), ".axon-replace-*")
		if createErr != nil {
			return createErr
		}
		tempPath := tempFile.Name()
		committed := false
		defer func() {
			_ = tempFile.Close()
			if !committed {
				_ = os.Remove(tempPath)
			}
		}()

		updated := strings.ReplaceAll(string(content), searchText, replacement)
		if _, writeErr := tempFile.WriteString(updated); writeErr != nil {
			return writeErr
		}
		if syncErr := tempFile.Sync(); syncErr != nil {
			return syncErr
		}
		if closeErr := tempFile.Close(); closeErr != nil {
			return closeErr
		}
		if chmodErr := os.Chmod(tempPath, info.Mode().Perm()); chmodErr != nil {
			return chmodErr
		}
		if renameErr := os.Rename(tempPath, path); renameErr != nil {
			return renameErr
		}
		committed = true
		result.FilesChanged++
		result.Replacements += matchCount
		return nil
	})
	return result, err
}
