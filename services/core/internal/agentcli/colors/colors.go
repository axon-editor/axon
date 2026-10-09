// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package colors

const (
	// ANSI colors keep the first CLI version dependency-free while still making
	// terminal output readable: dim status lines stay out of the way, streamed
	// model text is clear, and errors are immediately visible.
	AnsiReset       = "\033[0m"
	AnsiDim         = "\033[2m"
	AnsiGreen       = "\033[32m"
	AnsiRed         = "\033[31m"
	AnsiWhite       = "\033[37m"
	AnsiAccent      = "\033[38;2;128;200;224m"
	AnsiMuted       = "\033[38;2;154;164;184m"
	AnsiInputBg     = "\033[48;2;16;22;32m"
	AnsiActiveRow   = "\033[48;2;20;42;54m\033[38;2;223;247;255m"
	AnsiPromptCaret = "\033[48;2;223;247;255m\033[38;2;16;22;32m"
	ansiPanelBorder = "\033[38;2;54;66;86m"
	ansiBrand       = "\033[38;2;128;200;224m\033[1m"
	ansiHint        = "\033[38;2;112;124;148m"
)

// dim is used for progress and confirmation prompts. Those messages should be
// visible without competing with the model response the user actually asked for.
func Dim(text string) string {
	return AnsiDim + text + AnsiReset
}

// red is reserved for failures so command errors read like real terminal tool
// output instead of blending into streamed assistant text.
func Red(text string) string {
	return AnsiRed + text + AnsiReset
}

// green is reserved for successful local commands such as `/models` results.
// That keeps command output visually separate from streamed assistant text and
// makes availability checks easy to scan in a terminal.
func Green(text string) string {
	return AnsiGreen + text + AnsiReset
}

// white wraps streamed model deltas. Keeping this helper separate lets us later
// disable colors for non-TTY output without touching the stream parser.
func White(text string) string {
	return AnsiWhite + text + AnsiReset
}

func Accent(text string) string {
	return AnsiAccent + text + AnsiReset
}

func Muted(text string) string {
	return AnsiMuted + text + AnsiReset
}

func InputSurface(text string) string {
	return AnsiInputBg + text + AnsiReset
}

func ActiveRow(text string) string {
	return AnsiActiveRow + text + AnsiReset
}

func PromptCaret(text string) string {
	return AnsiPromptCaret + text + AnsiReset + AnsiInputBg
}

func PanelBorder(text string) string {
	return ansiPanelBorder + text + AnsiReset
}

func Brand(text string) string {
	return ansiBrand + text + AnsiReset
}

func Hint(text string) string {
	return ansiHint + text + AnsiReset
}
