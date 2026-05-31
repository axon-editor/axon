// Handles all file system operations for Axon, reading directory trees,
// reading file contents, and writing file contents.
// This package is intentionally pure (no HTTP concerns), it only deals
// with the file system and returns Go structs. The server layer handles
// serialization and HTTP responses.
package fs

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
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
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if entry.Name() == "node_modules" || entry.Name() == "vendor" || entry.Name() == "dist" {
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

// ReadFile reads the full contents of a file at the given path
// and returns it as a FileContent struct.
// Binary files will return garbled content, caller should validate
// file type before calling this if that matters.
func ReadFile(path string) (FileContent, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return FileContent{}, err
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
