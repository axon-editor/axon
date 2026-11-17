// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package safepath

import (
	"os"
	"path/filepath"
	"strings"
)

// ResolveExisting resolves symlinks for the deepest existing ancestor and
// reapplies the missing suffix. Tools need to validate a path that is about to
// be created, where EvalSymlinks on the full path would fail because the leaf
// does not exist yet.
func ResolveExisting(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}

	current := absolute
	suffix := make([]string, 0, 4)
	for {
		resolved, resolveErr := filepath.EvalSymlinks(current)
		if resolveErr == nil {
			for index := len(suffix) - 1; index >= 0; index-- {
				resolved = filepath.Join(resolved, suffix[index])
			}
			return resolved, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", resolveErr
		}
		suffix = append(suffix, filepath.Base(current))
		current = parent
	}
}

// Inside reports whether candidate stays under root. Both paths must already be
// resolved with ResolveExisting; comparing unresolved paths lets a symlink
// inside the workspace point outside it without changing the prefix.
func Inside(root string, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	if relative == "." {
		return true
	}
	return relative != ".." &&
		!strings.HasPrefix(relative, ".."+string(os.PathSeparator))
}
