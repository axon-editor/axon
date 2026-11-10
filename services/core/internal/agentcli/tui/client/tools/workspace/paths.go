// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package workspace

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Resolve turns a model-supplied path into an absolute path and proves it stays
// inside the workspace. Lexical cleaning alone is not enough: a symlink inside
// the workspace could point at the user's home directory, so the deepest
// existing ancestor is resolved before the final containment check.
func Resolve(root, raw string) (string, error) {
	root = strings.TrimSpace(root)
	raw = strings.TrimSpace(raw)
	if root == "" {
		return "", errors.New("workspace is not available")
	}
	if raw == "" {
		return "", errors.New("path is required")
	}

	rootAbsolute, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	rootReal, err := filepath.EvalSymlinks(rootAbsolute)
	if err != nil {
		return "", fmt.Errorf("workspace is not available: %w", err)
	}

	target := raw
	if !filepath.IsAbs(target) {
		target = filepath.Join(rootAbsolute, target)
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return "", err
	}

	realTarget, err := evalExisting(target)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(rootReal, realTarget)
	if err != nil {
		return "", err
	}
	if relative == ".." ||
		strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("path escapes the workspace")
	}
	return target, nil
}

func DisplayPath(root, target string) string {
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == "." || strings.HasPrefix(relative, "..") {
		return target
	}
	return relative
}

// evalExisting resolves the target when it exists, or the nearest existing
// ancestor when the file or folder is about to be created.
func evalExisting(path string) (string, error) {
	current := path
	suffix := []string{}

	for {
		resolved, err := filepath.EvalSymlinks(current)
		if err == nil {
			for index := len(suffix) - 1; index >= 0; index-- {
				resolved = filepath.Join(resolved, suffix[index])
			}
			return resolved, nil
		}
		if !os.IsNotExist(err) {
			return "", err
		}

		parent := filepath.Dir(current)
		if parent == current {
			return "", err
		}
		suffix = append(suffix, filepath.Base(current))
		current = parent
	}
}
