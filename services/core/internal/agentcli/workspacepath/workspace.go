// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package workspacepath

import "path/filepath"

func NormalizeWorkspacePath(folderPath string) (string, error) {
	absolute, err := filepath.Abs(folderPath)
	if err != nil {
		return "", err
	}
	return filepath.Clean(absolute), nil
}
