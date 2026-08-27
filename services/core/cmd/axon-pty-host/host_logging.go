package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
)

const maxHostLogBytes int64 = 2 << 20

type rotatingHostLog struct {
	mu   sync.Mutex
	path string
	file *os.File
	size int64
}

// configureHostLogging mirrors host diagnostics to bounded on-disk files.
// Packaged Electron normally captures child stdout and stderr through pipes,
// but those console messages disappear when the application itself crashes—the
// exact moment lifecycle evidence is most valuable. The rotating writer checks
// the limit on every write, rather than only at startup, because this host can
// stay alive for days and must not grow its diagnostic indefinitely between
// application restarts.
func configureHostLogging(logPath string) (func(), error) {
	if logPath == "" {
		return func() {}, nil
	}
	if err := os.MkdirAll(filepath.Dir(logPath), 0700); err != nil {
		return func() {}, err
	}

	writer := &rotatingHostLog{path: logPath}
	file, size, err := openPrivateHostLog(logPath)
	if err != nil {
		return func() {}, err
	}
	writer.file = file
	writer.size = size
	if size >= maxHostLogBytes {
		if err := writer.rotateLocked(); err != nil {
			_ = file.Close()
			return func() {}, err
		}
	}

	previousOutput := log.Writer()
	log.SetOutput(io.MultiWriter(previousOutput, writer))
	return func() {
		log.SetOutput(previousOutput)
		_ = writer.Close()
	}, nil
}

// Write rotates before a diagnostic would exceed the active-file limit. A
// single pathological log entry can itself be larger than the complete budget,
// so only its tail is persisted while the original byte count is returned to
// log.MultiWriter. This preserves normal logging behavior and still guarantees
// that neither pty-host.log nor pty-host.log.1 can grow beyond the configured
// limit.
func (writer *rotatingHostLog) Write(payload []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()

	if writer.file == nil {
		return 0, os.ErrClosed
	}
	originalSize := len(payload)
	if int64(len(payload)) > maxHostLogBytes {
		payload = payload[len(payload)-int(maxHostLogBytes):]
	}
	if writer.size+int64(len(payload)) > maxHostLogBytes {
		if err := writer.rotateLocked(); err != nil {
			return 0, err
		}
	}

	written, err := writer.file.Write(payload)
	writer.size += int64(written)
	if err != nil {
		return written, err
	}
	if written != len(payload) {
		return written, io.ErrShortWrite
	}
	return originalSize, nil
}

func (writer *rotatingHostLog) Close() error {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if writer.file == nil {
		return nil
	}
	err := writer.file.Close()
	writer.file = nil
	return err
}

// rotateLocked retains one previous segment and immediately opens a fresh
// private file. The unique per-installation log path and the writer mutex make
// the remove/rename/open sequence exclusive to this PTY host, while chmod keeps
// authentication and lifecycle details unavailable to other local users.
func (writer *rotatingHostLog) rotateLocked() error {
	if writer.file != nil {
		if err := writer.file.Close(); err != nil {
			return err
		}
		writer.file = nil
	}
	_ = os.Remove(writer.path + ".1")
	if err := os.Rename(writer.path, writer.path+".1"); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := retainHostLogTail(writer.path + ".1"); err != nil && !os.IsNotExist(err) {
		return err
	}
	file, size, err := openPrivateHostLog(writer.path)
	if err != nil {
		return err
	}
	writer.file = file
	writer.size = size
	return nil
}

func openPrivateHostLog(logPath string) (*os.File, int64, error) {
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return nil, 0, err
	}
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return nil, 0, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, 0, err
	}
	return file, info.Size(), nil
}

// retainHostLogTail also repairs a file that was already oversized when Axon
// started, such as one produced by an older build that only rotated on launch.
// Keeping the tail preserves the newest failure evidence, which is generally
// more useful than the beginning of a days-old host log.
func retainHostLogTail(logPath string) error {
	file, err := os.OpenFile(logPath, os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return err
	}
	if info.Size() <= maxHostLogBytes {
		return nil
	}

	tail := make([]byte, int(maxHostLogBytes))
	if _, err := file.ReadAt(tail, info.Size()-maxHostLogBytes); err != nil {
		return err
	}
	if err := file.Truncate(0); err != nil {
		return err
	}
	if _, err := file.WriteAt(tail, 0); err != nil {
		return err
	}
	return file.Truncate(maxHostLogBytes)
}
