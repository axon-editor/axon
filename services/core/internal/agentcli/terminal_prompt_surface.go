package agentcli

// terminalPromptSurfaceWidth returns the visible width Axon can safely own for
// its composer and session header surfaces.
//
// The raw-mode Unix prompt can detect the real terminal width through ioctl,
// while the portable fallback currently reports a conservative default. Keeping
// this calculation in a shared file matters because the session header is not a
// Unix-only feature: Windows still needs to compile the branded startup panel
// even though it uses the simpler line-based input path.
func terminalPromptSurfaceWidth() int {
	width := terminalPromptWidth()
	if width < 52 {
		return 52
	}

	// Most terminals wrap when the final printable cell is filled exactly,
	// especially around ANSI reset sequences. Reserving one column gives Axon's
	// full-width prompt room to render without leaving stray continuation lines.
	return width - 1
}
