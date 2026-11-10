// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package surface

import (
	"strings"

	"github.com/charmbracelet/x/ansi"
)

// Sanitize keeps model output, pasted prompts, and tool results from writing
// terminal control sequences. An agent can echo file contents, so this is a
// safety boundary, not just cosmetic cleanup.
func Sanitize(content string) string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	content = ansi.Strip(content)

	var builder strings.Builder
	builder.Grow(len(content))
	for _, value := range content {
		if value == '\n' || value == '\t' || (value >= 0x20 && value != 0x7f) {
			builder.WriteRune(value)
		}
	}
	return builder.String()
}
