// Package prompt owns the small, reusable pieces of Axon's terminal composer.
//
// The raw-mode composer still lives in the parent agentcli package because it
// calls local slash commands, model selectors, and stream helpers that are part
// of the command runtime. Keeping the pure prompt constants and editing helpers
// here lets the root package stop collecting every `prompt_*.go` file while we
// continue moving the terminal UI toward a proper package boundary.
package prompt

const Line = "Axon > "

const (
	// Title is the stable visual label for Axon's terminal composer. Both the
	// raw Unix renderer and the fallback line reader use the same label so the
	// command still feels like Axon even when a terminal does not support raw
	// mode.
	Title = "Axon"

	// MaxSuggestions keeps slash-command discovery useful without letting the
	// suggestion list take over the terminal. The composer is part of an agent
	// conversation, so prompt input and streamed answers should stay visually
	// dominant.
	MaxSuggestions = 4

	// MaxInputRows caps the owned prompt surface before it scrolls internally.
	// Without a cap, a pasted prompt can push previous terminal context far away
	// while the user is still editing it.
	MaxInputRows = 6
)
