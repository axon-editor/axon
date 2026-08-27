package main

import (
	"io"
	"os"
)

// monitorOwnerPipe turns Electron's inherited stdin pipe into a process
// lifetime guarantee. A child process cannot reliably infer every form of
// parent death from signals alone, but the operating system always closes the
// parent end of an anonymous pipe when Electron exits or crashes. The host can
// therefore shut itself down instead of surviving as an unreachable orphan.
func monitorOwnerPipe(enabled bool) <-chan struct{} {
	if !enabled {
		return nil
	}
	return monitorOwner(os.Stdin)
}

func monitorOwner(reader io.Reader) <-chan struct{} {
	ownerLost := make(chan struct{})
	go func() {
		buffer := make([]byte, 1)
		for {
			_, err := reader.Read(buffer)
			if err == nil {
				continue
			}
			// This pipe carries ownership rather than application data, so there
			// is no recoverable read error for the host to handle. EOF is the
			// normal parent-exit signal, while errors such as a closed descriptor
			// mean the ownership channel is equally unusable. Treating every error
			// as owner loss prevents a rare read failure from silently disabling
			// orphan cleanup for the rest of the host process lifetime.
			close(ownerLost)
			return
		}
	}()

	return ownerLost
}
