// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build !darwin && !linux && !windows

package ai

// hostMemoryBytes reports an unknown amount on platforms without a memory
// probe. Returning zero keeps every catalog model visible.
func hostMemoryBytes() int64 {
	return 0
}
