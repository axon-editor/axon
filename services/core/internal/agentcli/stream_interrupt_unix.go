//go:build unix

package agentcli

import (
	"os"
	"sync"

	"golang.org/x/sys/unix"
)

type streamInterruptState struct {
	fd          int
	oldState    *unix.Termios
	stop        chan struct{}
	restoreOnce sync.Once
	mu          sync.Mutex
	interrupted bool
}

// startStreamInterrupt watches stdin while a model response is streaming so
// Escape can cancel the request immediately. The prompt already uses raw mode,
// but after the prompt returns the terminal normally goes back to canonical
// input, where Escape would not reach Axon until Enter is pressed. Temporarily
// entering raw mode here keeps interruption instant without changing the normal
// shell state after the stream finishes.
func startStreamInterrupt(cancel func()) *streamInterruptState {
	state := &streamInterruptState{
		fd:   int(os.Stdin.Fd()),
		stop: make(chan struct{}),
	}
	if !isInteractiveTTY() {
		return state
	}

	oldState, err := unix.IoctlGetTermios(state.fd, ioctlReadTermios)
	if err != nil {
		return state
	}
	rawState := *oldState
	rawState.Lflag &^= unix.ECHO | unix.ICANON | unix.ISIG | unix.IEXTEN
	rawState.Iflag &^= unix.ICRNL | unix.IXON | unix.BRKINT | unix.INPCK | unix.ISTRIP
	rawState.Cflag |= unix.CS8
	rawState.Cc[unix.VMIN] = 0
	rawState.Cc[unix.VTIME] = 1
	if err := unix.IoctlSetTermios(state.fd, ioctlWriteTermios, &rawState); err != nil {
		return state
	}
	state.oldState = oldState

	go func() {
		buffer := []byte{0}
		for {
			select {
			case <-state.stop:
				return
			default:
			}

			count, err := unix.Read(state.fd, buffer)
			if err != nil || count == 0 {
				continue
			}
			if buffer[0] != 27 {
				continue
			}
			state.mu.Lock()
			state.interrupted = true
			state.mu.Unlock()
			cancel()
			return
		}
	}()

	return state
}

func (state *streamInterruptState) Stop() {
	state.restoreOnce.Do(func() {
		close(state.stop)
		if state.oldState != nil {
			_ = unix.IoctlSetTermios(state.fd, ioctlWriteTermios, state.oldState)
		}
	})
}

func (state *streamInterruptState) Interrupted() bool {
	state.mu.Lock()
	defer state.mu.Unlock()
	return state.interrupted
}
