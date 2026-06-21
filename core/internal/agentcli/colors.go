package agentcli

const (
	// ANSI colors keep the first CLI version dependency-free while still making
	// terminal output readable: dim status lines stay out of the way, streamed
	// model text is clear, and errors are immediately visible.
	ansiReset = "\033[0m"
	ansiDim   = "\033[2m"
	ansiRed   = "\033[31m"
	ansiWhite = "\033[37m"
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

// white wraps streamed model deltas. Keeping this helper separate lets us later
// disable colors for non-TTY output without touching the stream parser.
func white(text string) string {
	return ansiWhite + text + ansiReset
}
