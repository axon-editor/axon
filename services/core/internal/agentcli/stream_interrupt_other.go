//go:build !unix

package agentcli

type streamInterruptState struct{}

// startStreamInterrupt is a no-op outside Unix terminals because the raw-mode
// Escape watcher depends on termios. The stream still respects context
// cancellation from callers; this fallback only keeps non-Unix builds compiling
// until Axon gets a Windows-specific console input path.
func startStreamInterrupt(_ func()) *streamInterruptState {
	return &streamInterruptState{}
}

func (state *streamInterruptState) Stop() {}

func (state *streamInterruptState) Interrupted() bool {
	return false
}
