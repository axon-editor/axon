package agentcli

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
)

type slashCommandDefinition struct {
	Name    string
	Summary string
	Aliases []string
}

func slashCommandsCatalog() []slashCommandDefinition {
	return []slashCommandDefinition{
		{
			Name:    "help",
			Summary: "show local slash commands",
		},
		{
			Name:    "model",
			Summary: "choose the Axon model for this terminal",
			Aliases: []string{"models"},
		},
	}
}

// runSlashCommand gives `axon ask` a lightweight local command surface.
// The goal is to keep fast, deterministic commands out of the model path so
// the terminal feels more like a real agent shell: `/models` answers instantly
// from local runtime state, while normal questions still stream through Axon.
func runSlashCommand(prompt string) (bool, int) {
	trimmed := strings.TrimSpace(prompt)
	if !strings.HasPrefix(trimmed, "/") {
		return false, 0
	}

	fields := strings.Fields(strings.TrimPrefix(trimmed, "/"))
	if len(fields) == 0 {
		fmt.Fprintln(os.Stderr, red("Use /models or /help after axon ask."))
		return true, 1
	}

	commandName, ok := resolveSlashCommandName(fields[0])
	if !ok {
		fmt.Fprintln(os.Stderr, red("Unknown Axon command: /"+fields[0]))
		fmt.Fprintln(os.Stderr, dim("Try /models or /help."))
		return true, 1
	}

	switch commandName {
	case "model", "models":
		return true, runModelSlashCommand()
	case "help":
		printSlashHelp()
		return true, 0
	}

	return true, 0
}

// runModelSlashCommand opens an interactive model picker instead of printing a
// passive list. The command is local and deterministic: it asks the backend for
// the Axon model catalog, shows only Axon-facing model names, then stores the
// selected Axon model id for the next stream request.
func runModelSlashCommand() int {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	models, err := ai.ListModels(ctx, defaultModelID())
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	selectedModel := defaultModelID()
	selectableModels := installedModels(models)
	if len(selectableModels) == 0 {
		fmt.Fprintln(os.Stderr, red("No Axon models are installed locally."))
		return 1
	}

	nextModel, ok, err := selectModelPrompt(selectableModels, selectedModel)
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	if !ok {
		fmt.Println(dim("Model selection cancelled."))
		return 0
	}

	if err := saveAgentCliConfig(agentCliConfig{SelectedModel: nextModel}); err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	fmt.Println(green("Selected " + modelLabel(models, nextModel)))
	return 0
}

func statusColor(installed bool) string {
	if installed {
		return green("ready")
	}
	return red("missing")
}

func printSlashHelp() {
	fmt.Println("Local Axon commands")
	fmt.Println("  /models   choose the Axon model for this terminal")
	fmt.Println("  /help     show local slash commands")
}

func resolveSlashCommandName(input string) (string, bool) {
	trimmed := strings.ToLower(strings.TrimSpace(input))
	if trimmed == "" {
		return "", false
	}

	matches := make([]slashCommandDefinition, 0, 1)
	for _, command := range slashCommandsCatalog() {
		if command.Name == trimmed {
			return command.Name, true
		}
		if strings.HasPrefix(command.Name, trimmed) {
			matches = append(matches, command)
			continue
		}
		for _, alias := range command.Aliases {
			if alias == trimmed {
				return command.Name, true
			}
			if strings.HasPrefix(alias, trimmed) {
				matches = append(matches, command)
				break
			}
		}
	}

	if len(matches) != 1 {
		return "", false
	}
	return matches[0].Name, true
}

func modelLabel(models []ai.ModelInfo, modelID string) string {
	for _, model := range models {
		if model.ID == modelID {
			return model.Label
		}
	}
	return "Axon model"
}

func installedModels(models []ai.ModelInfo) []ai.ModelInfo {
	installed := make([]ai.ModelInfo, 0, len(models))
	for _, model := range models {
		if model.Available {
			installed = append(installed, model)
		}
	}
	return installed
}

func filterSlashCommands(prefix string) []slashCommandDefinition {
	catalog := slashCommandsCatalog()
	trimmed := strings.TrimSpace(strings.TrimPrefix(prefix, "/"))
	if trimmed == "" {
		return catalog
	}

	filtered := make([]slashCommandDefinition, 0, len(catalog))
	lowered := strings.ToLower(trimmed)
	for _, command := range catalog {
		if strings.HasPrefix(command.Name, lowered) {
			filtered = append(filtered, command)
			continue
		}
		for _, alias := range command.Aliases {
			if strings.HasPrefix(alias, lowered) {
				filtered = append(filtered, command)
				break
			}
		}
	}
	return filtered
}
