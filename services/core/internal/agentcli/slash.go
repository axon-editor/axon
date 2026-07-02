package agentcli

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	"github.com/GordenArcher/axon-core/internal/ai"
)

type slashCommandDefinition struct {
	Name     string
	Summary  string
	Shortcut string
	Aliases  []string
}

func slashCommandsCatalog() []slashCommandDefinition {
	return []slashCommandDefinition{
		{
			Name:     "help",
			Summary:  "show local slash commands",
			Shortcut: "?",
		},
		{
			Name:     "model",
			Summary:  "choose the Axon model for this terminal",
			Shortcut: "ctrl+x m",
			Aliases:  []string{"models"},
		},
		{
			Name:     "tools",
			Summary:  "show deterministic project tools used by the CLI",
			Shortcut: "ctrl+x t",
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
	case "tools":
		printToolsHelp()
		return true, 0
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

	if err := configstore.Save(configstore.Config{SelectedModel: nextModel}); err != nil {
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
	fmt.Println("  /tools    show deterministic project tools used by the CLI")
	fmt.Println("  /help     show local slash commands")
}

func printToolsHelp() {
	fmt.Println("Axon CLI project tools")
	fmt.Println("  list_files       attaches workspace structure for project/codebase questions")
	fmt.Println("  read_file        attaches mentioned source files by path")
	fmt.Println("  search_project   searches symbols/text for where/find/search prompts")
	fmt.Println("  problems         attaches current Axon Problems for this workspace")
	fmt.Println("  git_diff         attaches Git diff summaries for change/review prompts")
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

// filterSlashCommands mirrors the command-popup behavior users expect from
// Codex-style CLIs: only the first slash token controls the popup, aliases are
// treated as first-class matches, and typo-tolerant fuzzy matches still show a
// useful suggestion. Ranking matters here because Enter accepts the highlighted
// row; exact matches must win over broad fuzzy matches or `/models` could run a
// surprising command as the catalog grows.
func filterSlashCommands(prefix string) []slashCommandDefinition {
	catalog := slashCommandsCatalog()
	trimmed := strings.TrimSpace(strings.TrimPrefix(prefix, "/"))
	if trimmed == "" {
		return catalog
	}

	// A slash command may eventually accept arguments, so filtering on the whole
	// line would make `/model fast` stop matching `/model`. Codex's composer
	// filters on the first token and leaves the remaining text for the command
	// handler; Axon follows the same contract here.
	token := strings.Fields(trimmed)
	if len(token) == 0 {
		return catalog
	}

	exactMatches := make([]slashCommandDefinition, 0, len(catalog))
	prefixMatches := make([]slashCommandDefinition, 0, len(catalog))
	fuzzyMatches := make([]slashCommandDefinition, 0, len(catalog))
	lowered := strings.ToLower(token[0])
	for _, command := range catalog {
		// The three buckets preserve useful ordering without needing a heavier
		// ranking engine. Exact command/alias hits are what Enter should choose,
		// prefix hits are what normal typing expects, and fuzzy hits are the
		// recovery path for small mistakes like `/mdl`.
		if command.Name == lowered {
			exactMatches = append(exactMatches, command)
			continue
		}
		if commandSlashAliasMatch(command, lowered, func(candidate string, value string) bool {
			return candidate == value
		}) {
			exactMatches = append(exactMatches, command)
			continue
		}
		if strings.HasPrefix(command.Name, lowered) {
			prefixMatches = append(prefixMatches, command)
			continue
		}
		if commandSlashAliasMatch(command, lowered, func(candidate string, value string) bool {
			return strings.HasPrefix(candidate, value)
		}) {
			prefixMatches = append(prefixMatches, command)
			continue
		}
		if slashFuzzyMatch(command.Name, lowered) || commandSlashAliasMatch(command, lowered, slashFuzzyMatch) {
			fuzzyMatches = append(fuzzyMatches, command)
		}
	}
	return append(append(exactMatches, prefixMatches...), fuzzyMatches...)
}

// commandSlashAliasMatch lets aliases participate in the same matching pass as
// canonical command names. Without this helper, `/models` could resolve when
// submitted but fail to highlight `/model` in the popup, which makes the UI feel
// inconsistent even though the command eventually works.
func commandSlashAliasMatch(command slashCommandDefinition, value string, match func(string, string) bool) bool {
	for _, alias := range command.Aliases {
		if match(alias, value) {
			return true
		}
	}
	return false
}

// slashFuzzyMatch is intentionally simple subsequence matching. It is enough
// for a tiny local command catalog, keeps the CLI dependency-free, and still
// gives the important "/mdl resolves to /model" behavior from larger TUI
// command palettes without needing a ranking library.
func slashFuzzyMatch(candidate string, query string) bool {
	if query == "" {
		return true
	}
	queryIndex := 0
	for _, char := range candidate {
		if queryIndex >= len(query) {
			return true
		}
		if byte(char) == query[queryIndex] {
			queryIndex++
		}
	}
	return queryIndex == len(query)
}
