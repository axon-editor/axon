// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build linux

package ai

import (
	"os"
	"strconv"
	"strings"
)

// hostMemoryBytes reads MemTotal from /proc/meminfo, which is reported in
// kibibytes.
func hostMemoryBytes() int64 {
	content, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(content), "\n") {
		if !strings.HasPrefix(line, "MemTotal:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0
		}
		kibibytes, err := strconv.ParseInt(fields[1], 10, 64)
		if err != nil || kibibytes <= 0 {
			return 0
		}
		return kibibytes * 1024
	}
	return 0
}
