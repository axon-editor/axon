// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package components

// Message is the TUI's transcript unit. Role and text stay separate from the
// renderer so tools and approvals can add their own record types without
// reshaping the streaming client.
type Message struct {
	ID        string
	Role      string
	Content   string
	Thinking  bool
	Collapsed bool
}
