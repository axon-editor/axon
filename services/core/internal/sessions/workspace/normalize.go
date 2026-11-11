// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package workspace

import (
	"path/filepath"
	"strings"
)

// Normalize makes workspace identity stable across surfaces. macOS reports
// /private/tmp after chdir even when a caller stored /tmp, so resolving symlinks
// is required for the CLI and editor to see the same conversations.
func Normalize(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return ""
	}
	absolute, err := filepath.Abs(trimmed)
	if err != nil {
		return filepath.Clean(trimmed)
	}
	absolute = filepath.Clean(absolute)
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return absolute
	}
	return resolved
}
