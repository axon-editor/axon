// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package workspace

import (
	"fmt"
	"os"
	"path/filepath"
)

func WriteFile(root, rawPath, content string) (string, bool) {
	target, err := Resolve(root, rawPath)
	if err != nil {
		return "write_file failed: " + err.Error(), false
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return "write_file failed: " + err.Error(), false
	}
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		return "write_file failed: " + err.Error(), false
	}
	return fmt.Sprintf(
		"Wrote %d bytes to %s.",
		len(content),
		DisplayPath(root, target),
	), true
}

func CreateDirectory(root, rawPath string) (string, bool) {
	target, err := Resolve(root, rawPath)
	if err != nil {
		return "create_directory failed: " + err.Error(), false
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return "create_directory failed: " + err.Error(), false
	}
	return "Created directory " + DisplayPath(root, target) + ".", true
}
