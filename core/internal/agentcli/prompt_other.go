//go:build !unix

package agentcli

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func readAgentPrompt() (string, error) {
	fmt.Fprint(os.Stdout, interactivePromptLine)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && len(strings.TrimSpace(line)) == 0 {
		return "", err
	}
	return strings.TrimSpace(line), nil
}
