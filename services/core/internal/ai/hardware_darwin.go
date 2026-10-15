// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build darwin

package ai

import (
	"os/exec"
	"strconv"
	"strings"
)

// hostMemoryBytes reads the installed physical memory on macOS. hw.memsize is
// reported in bytes and covers the unified memory used by Apple silicon GPUs.
func hostMemoryBytes() int64 {
	output, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
	if err != nil {
		return 0
	}
	bytes, err := strconv.ParseInt(strings.TrimSpace(string(output)), 10, 64)
	if err != nil || bytes <= 0 {
		return 0
	}
	return bytes
}
