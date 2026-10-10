// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build windows

package hostruntime

// ControlPathReachesHost always reports true on Windows. A named pipe cannot be
// unlinked and replaced through a filesystem pathname while the owning listener
// remains open, so there is nothing to reclaim. Serve failures still terminate
// the host and follow Electron's normal recovery path.
func ControlPathReachesHost(_ string, _ string) bool {
	return true
}
