// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package identity

import "strings"

const (
	// DefaultTitle is shown before the first prompt and for empty sessions.
	DefaultTitle  = "New conversation"
	maxTitleRunes = 60
	titleEllipsis = "..."
)

// Title derives a session name from the first user prompt. Runes, not bytes,
// so a non-Latin prompt is not cut mid-character in the picker.
func Title(prompt string) string {
	trimmed := strings.TrimSpace(prompt)
	if trimmed == "" {
		return DefaultTitle
	}
	runes := []rune(trimmed)
	if len(runes) > maxTitleRunes {
		return string(runes[:maxTitleRunes-len(titleEllipsis)]) + titleEllipsis
	}
	return trimmed
}
