// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package hostruntime

import (
	"io"
	"os"
)

// MonitorOwnerPipe turns Electron's inherited stdin pipe into a process lifetime
// guarantee. A child process cannot reliably infer every form of parent death
// from signals alone, but the operating system always closes the parent end of an
// anonymous pipe when Electron exits or crashes. The host can therefore shut
// itself down instead of surviving as an unreachable orphan that keeps a private
// port bound.
func MonitorOwnerPipe(enabled bool) <-chan struct{} {
	if !enabled {
		return nil
	}
	return MonitorOwner(os.Stdin)
}

// MonitorOwner watches an arbitrary reader for the owner-pipe contract so tests
// can drive it with an os.Pipe instead of a real parent.
func MonitorOwner(reader io.Reader) <-chan struct{} {
	ownerLost := make(chan struct{})
	go func() {
		buffer := make([]byte, 1)
		for {
			_, err := reader.Read(buffer)
			if err == nil {
				continue
			}
			// This pipe carries ownership rather than application data, so there is
			// no recoverable read error. EOF is the normal parent-exit signal, while
			// other errors mean the ownership channel is equally unusable. Treating
			// every error as owner loss prevents a rare read failure from silently
			// disabling orphan cleanup for the rest of the host lifetime.
			close(ownerLost)
			return
		}
	}()

	return ownerLost
}
