package agentcli

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
)

// openInEditor implements the shortest terminal workflow: `axon .`.
// This function only opens a project in the desktop app; it does not try to
// talk to axon-core because opening the GUI is owned by the operating system's
// app launcher on macOS and Windows.
func openInEditor(targetPath string) error {
	absolutePath, err := filepath.Abs(targetPath)
	if err != nil {
		return err
	}

	// Opening a project is platform-specific because macOS has an app bundle,
	// Linux usually has a launcher binary, and Windows goes through shell
	// association. The CLI keeps that branching here so ask/commit can remain
	// focused on the backend streaming contract.
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-a", "Axon", absolutePath).Run()
	case "linux":
		return exec.Command("axon-editor", absolutePath).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", "", "Axon", absolutePath).Run()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}
