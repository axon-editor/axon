package agentcli

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	"github.com/GordenArcher/axon-core/internal/ai"
)

func selectedModelID() string {
	// The CLI needs its own selected-model preference because it can run without
	// the Electron renderer being open. Keeping this in ~/.axon also means
	// `axon`, `axon ask`, and future terminal-only agent commands share one
	// local preference without reaching into renderer localStorage.
	if modelID := strings.TrimSpace(os.Getenv("AXON_AGENT_MODEL")); modelID != "" {
		return modelID
	}

	config := configstore.Load()
	if strings.TrimSpace(config.SelectedModel) != "" {
		return strings.TrimSpace(config.SelectedModel)
	}
	return "axon-code-fast"
}

func selectModelLinePrompt(models []ai.ModelInfo, selectedModel string) (string, bool, error) {
	// Raw-mode selection is only available when stdin/stdout are real terminals.
	// Piped shells, CI, and unsupported platforms still need a readable fallback,
	// so this numbered prompt keeps /model usable without escape-sequence UI.
	if len(models) == 0 {
		return "", false, nil
	}

	fmt.Println("Axon models")
	for index, model := range models {
		current := ""
		if model.ID == selectedModel {
			current = " " + dim("selected")
		}
		fmt.Printf("%d. %s %s%s\n", index+1, model.Label, statusColor(model.Available), current)
		if strings.TrimSpace(model.Description) != "" {
			fmt.Println("   " + dim(model.Description))
		}
	}
	fmt.Print("Select model number: ")

	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return "", false, err
	}
	selected, err := strconv.Atoi(strings.TrimSpace(line))
	if err != nil || selected < 1 || selected > len(models) {
		return "", false, nil
	}
	return models[selected-1].ID, true, nil
}
