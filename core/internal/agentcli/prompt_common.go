package agentcli

const interactivePromptLine = "Axon > "

const (
	// The prompt needs a stable visual label so the terminal feels like a real
	// Axon-specific input surface instead of a generic stdin reader. The live
	// renderer uses this label as the fixed prefix beside the filled input
	// surface, while the fallback line reader still prints the same prefix when
	// raw mode is not available.
	interactivePromptTitle = "Axon"
	maxPromptSuggestions   = 4
)
