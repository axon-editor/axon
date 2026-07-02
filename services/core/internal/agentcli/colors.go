package agentcli

const (
	// ANSI colors keep the first CLI version dependency-free while still making
	// terminal output readable: dim status lines stay out of the way, streamed
	// model text is clear, and errors are immediately visible.
	ansiReset       = "\033[0m"
	ansiDim         = "\033[2m"
	ansiGreen       = "\033[32m"
	ansiRed         = "\033[31m"
	ansiWhite       = "\033[37m"
	ansiAccent      = "\033[38;2;128;200;224m"
	ansiMuted       = "\033[38;2;154;164;184m"
	ansiInputBg     = "\033[48;2;16;22;32m"
	ansiActiveRow   = "\033[48;2;20;42;54m\033[38;2;223;247;255m"
	ansiPromptCaret = "\033[48;2;223;247;255m\033[38;2;16;22;32m"
	ansiPanelBorder = "\033[38;2;54;66;86m"
	ansiBrand       = "\033[38;2;128;200;224m\033[1m"
	ansiHint        = "\033[38;2;112;124;148m"
)

// dim is used for progress and confirmation prompts. Those messages should be
// visible without competing with the model response the user actually asked for.
func dim(text string) string {
	return ansiDim + text + ansiReset
}

// red is reserved for failures so command errors read like real terminal tool
// output instead of blending into streamed assistant text.
func red(text string) string {
	return ansiRed + text + ansiReset
}

// green is reserved for successful local commands such as `/models` results.
// That keeps command output visually separate from streamed assistant text and
// makes availability checks easy to scan in a terminal.
func green(text string) string {
	return ansiGreen + text + ansiReset
}

// white wraps streamed model deltas. Keeping this helper separate lets us later
// disable colors for non-TTY output without touching the stream parser.
func white(text string) string {
	return ansiWhite + text + ansiReset
}

func accent(text string) string {
	return ansiAccent + text + ansiReset
}

func muted(text string) string {
	return ansiMuted + text + ansiReset
}

func inputSurface(text string) string {
	return ansiInputBg + text + ansiReset
}

func activeRow(text string) string {
	return ansiActiveRow + text + ansiReset
}

func promptCaret(text string) string {
	return ansiPromptCaret + text + ansiReset + ansiInputBg
}

func panelBorder(text string) string {
	return ansiPanelBorder + text + ansiReset
}

func brand(text string) string {
	return ansiBrand + text + ansiReset
}

func hint(text string) string {
	return ansiHint + text + ansiReset
}
