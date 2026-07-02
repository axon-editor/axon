package terminalui

import (
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

type BannerOptions struct {
	Mode      string
	Workspace string
}

var (
	bannerTitleStyle = lipgloss.NewStyle().
				Bold(true).
				Foreground(lipgloss.Color("#DFF7FF")).
				Background(lipgloss.Color("#0F1E2A")).
				Padding(0, 1)
	bannerAccentStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#80C8E0")).
				Bold(true)
	bannerMutedStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#9AA4B8"))
	bannerWorkspaceStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("#B8C7D9"))
)

// PrintStartupBanner gives every `axon ...` entry point a recognizable terminal
// opening without forcing the whole CLI into a full-screen TUI. The animation
// intentionally stays inline: Axon is still a command-line companion here, so a
// full-screen terminal app would make quick commands such as `axon .` feel
// heavier than opening the editor should feel.
func PrintStartupBanner(output *os.File, options BannerOptions) {
	if output == nil {
		output = os.Stdout
	}
	if !IsTerminalOutput(output) {
		printStaticBanner(output, options)
		return
	}

	frames := []string{"◐", "◓", "◑", "◒"}
	for index := 0; index < 8; index++ {
		fmt.Fprint(output, "\r\033[2K")
		fmt.Fprint(output, renderInlineBanner(options, frames[index%len(frames)]))
		time.Sleep(35 * time.Millisecond)
	}
	fmt.Fprint(output, "\r\033[2K")
	fmt.Fprint(output, renderBanner(options, "•"))
}

func printStaticBanner(output io.Writer, options BannerOptions) {
	fmt.Fprint(output, renderBanner(options, "•"))
}

func renderBanner(options BannerOptions, frame string) string {
	line := renderInlineBanner(options, frame)
	if workspace := strings.TrimSpace(options.Workspace); workspace != "" {
		line += "\n"
		line += bannerWorkspaceStyle.Render("workspace ")
		line += bannerMutedStyle.Render(workspace)
	}
	return line + "\n"
}

func renderInlineBanner(options BannerOptions, frame string) string {
	mode := strings.TrimSpace(options.Mode)
	if mode == "" {
		mode = "Local agent ready"
	}

	var builder strings.Builder
	builder.WriteString(bannerTitleStyle.Render("AXON"))
	builder.WriteString(" ")
	builder.WriteString(bannerAccentStyle.Render(frame))
	builder.WriteString(" ")
	builder.WriteString(bannerMutedStyle.Render(mode))
	return builder.String()
}

// PrintChatRole paints a small turn label before assistant output or command
// context. The label is intentionally not a boxed panel because streamed text
// should remain copyable terminal output, but the user still needs a clear
// boundary between Axon's status messages and the model answer.
func PrintChatRole(output io.Writer, label string) {
	if strings.TrimSpace(label) == "" {
		return
	}
	fmt.Fprintln(output, bannerAccentStyle.Render(strings.TrimSpace(label)))
}
