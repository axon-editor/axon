//go:build !unix

package agentcli

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/prompt"
	"github.com/GordenArcher/axon-core/internal/ai"
)

func readAgentPrompt(history []string) (string, error) {
	fmt.Fprint(os.Stdout, prompt.Line)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && len(strings.TrimSpace(line)) == 0 {
		return "", err
	}
	return strings.TrimSpace(line), nil
}

func selectModelPrompt(models []ai.ModelInfo, selectedModel string) (string, bool, error) {
	// Windows builds do not use the Unix raw-mode picker because terminal input
	// mode, escape sequences, and ioctl width detection are platform-specific.
	// The numbered fallback keeps `/model` functional and, more importantly,
	// keeps the release build compiling without pretending the Unix terminal
	// control path is portable.
	return selectModelLinePrompt(models, selectedModel)
}

func terminalPromptWidth() int {
	// The streaming status renderer only needs a conservative width so it can
	// avoid wrapping status text. Windows does not compile the Unix ioctl helper,
	// so the non-Unix path uses the same stable default that raw-mode prompt
	// rendering falls back to when terminal size cannot be detected.
	return 80
}
