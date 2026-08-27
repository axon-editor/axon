//go:build windows

package main

func controlPathReachesHost(_ string, _ string) bool {
	// Windows named pipes cannot be unlinked and replaced through a filesystem
	// pathname while the owning listener remains open. Serve failures still
	// terminate the host and follow Electron's normal recovery path.
	return true
}
