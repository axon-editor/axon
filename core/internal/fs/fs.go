// Handles all file system operations for Axon, reading directory trees,
// reading file contents, and writing file contents.
// This package is intentionally pure (no HTTP concerns), it only deals
// with the file system and returns Go structs. The server layer handles
// serialization and HTTP responses.
package fs

import (
	"bufio"
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
	// Search is different from the visible tree. Showing node_modules and dist
	// is useful for navigation, but scanning those folders by default would make
	// workspace search feel broken on real JavaScript projects. This keeps the
	// tree honest while search stays focused on source files.
	switch name {
	case ".git", ".DS_Store", "node_modules", "vendor", "dist", "release":
		return true
	default:
		return false
	}
}

func trimSearchPreview(line string) string {
	preview := strings.TrimSpace(line)
	if len(preview) <= 220 {
		return preview
	}

	return preview[:220]
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

// GetTree recursively walks a directory and builds a FileNode tree.
// It skips hidden files/folders (dot-prefixed) and known noise directories
// like node_modules and vendor to keep the tree clean and relevant.
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

	// if this is a file (not a directory), return immediately —
	// no children to walk
	if !info.IsDir() {
		return node, nil
	}

	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return FileNode{}, err
	}

	// separate directories and files so we can sort them independently.
	// directories always come first in the tree, files after.
	// both groups are sorted alphabetically within themselves.
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

	// dirs first, then files
	for _, entry := range append(dirs, files...) {
		childPath := filepath.Join(rootPath, entry.Name())
		child, err := GetTree(childPath)
		if err != nil {
			continue
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
	if maxResults <= 0 {
		maxResults = 100
	}

	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		return []SearchResult{}, nil
	}

	results := []SearchResult{}
	err := filepath.WalkDir(rootPath, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		if path != rootPath && shouldSkipSearchEntry(entry.Name()) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if entry.IsDir() || len(results) >= maxResults {
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
				return nil
			}
		}

		return nil
	})

	return results, err
}
