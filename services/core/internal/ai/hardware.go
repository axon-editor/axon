// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package ai

import (
	"runtime"
	"sync"
)

// hostMemoryOnce caches the probe result because the value never changes while
// the process is alive and it is read on every model listing.
var hostMemoryOnce struct {
	sync.Once
	bytes int64
}

// HostMemoryGB reports the total physical memory of the machine running
// axon-core in whole gigabytes. Detection is best-effort: a zero result means
// the amount could not be read, which the catalog treats as an unknown host so
// a probe failure never hides every model from the user.
func HostMemoryGB() int {
	return int(cachedHostMemoryBytes() / (1024 * 1024 * 1024))
}

// HostArch reports the machine architecture (for example "arm64" or "amd64").
func HostArch() string {
	return runtime.GOARCH
}

// HostOS reports the host operating system (for example "darwin" or "linux").
func HostOS() string {
	return runtime.GOOS
}

func cachedHostMemoryBytes() int64 {
	hostMemoryOnce.Do(func() {
		hostMemoryOnce.bytes = hostMemoryBytes()
	})
	return hostMemoryOnce.bytes
}
