// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package agent

import (
	"context"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

// awaitDecision blocks until the TUI answers the matching request. A nil channel
// means the caller did not wire approvals, so the safe default is denial rather
// than silently executing a write or command.
func (l *loop) awaitDecision(
	ctx context.Context,
	id string,
) (client.Decision, bool) {
	if l.request.Decisions == nil {
		return client.Decision{}, false
	}
	for {
		select {
		case decision, ok := <-l.request.Decisions:
			if !ok {
				return client.Decision{}, false
			}
			if decision.ID != id {
				continue
			}
			return decision, true
		case <-ctx.Done():
			return client.Decision{}, false
		}
	}
}
