// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package permission

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	opencodeclient "github.com/GordenArcher/axon-core/internal/agentcli/opencode/client"
	tuiclient "github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
)

const replyTimeout = 2 * time.Second

// FromData decodes the provider's permission payload into the narrow
// struct the CLI understands. A malformed frame is dropped rather than turned
// into a failed run because the next event usually carries the real tool state.
func FromData(data map[string]any) (opencodeclient.PermissionRequest, bool) {
	encoded, err := json.Marshal(data)
	if err != nil {
		return opencodeclient.PermissionRequest{}, false
	}
	var permission opencodeclient.PermissionRequest
	if err := json.Unmarshal(encoded, &permission); err != nil {
		return opencodeclient.PermissionRequest{}, false
	}
	if permission.ID == "" || permission.Action == "" {
		return opencodeclient.PermissionRequest{}, false
	}
	return permission, true
}

// Arguments maps the first resource onto the argument name Axon's
// tool card already renders. Dumping the raw resources array makes every
// approval look like an unreadable provider payload.
func Arguments(permission opencodeclient.PermissionRequest) string {
	first := ""
	if len(permission.Resources) > 0 {
		first = permission.Resources[0]
	}
	switch permission.Action {
	case "shell", "bash":
		return jsonText(map[string]string{"command": first})
	case "edit", "write":
		return jsonText(map[string]string{"path": first})
	case "webfetch":
		return jsonText(map[string]string{"url": first})
	}
	return jsonText(map[string][]string{"resources": permission.Resources})
}

// Summary is the one line the approval card shows in the transcript. The first
// resource is the command or path the user is deciding about, which is more
// useful than the provider's generic action label.
func Summary(permission opencodeclient.PermissionRequest) string {
	if len(permission.Resources) > 0 && permission.Resources[0] != "" {
		return permission.Resources[0]
	}
	if permission.Message != "" {
		return permission.Message
	}
	return permission.Action
}

// Details keeps every resource visible when the provider asks about more than
// one file or URL in a single decision.
func Details(permission opencodeclient.PermissionRequest) string {
	lines := []string{"OpenCode requested " + permission.Action}
	for _, resource := range permission.Resources {
		if strings.TrimSpace(resource) != "" {
			lines = append(lines, resource)
		}
	}
	return strings.Join(lines, "\n")
}

// DecisionName translates the TUI answer into the provider's vocabulary.
// "always" is only used when the user explicitly chose the session-wide allow
// option, because that choice outlives the current tool call.
func DecisionName(decision tuiclient.Decision) string {
	if !decision.Approved {
		return "reject"
	}
	if decision.AllowSession {
		return "always"
	}
	return "once"
}

// Reply uses a fresh context because the run context may already be
// cancelled when the user closes the prompt. Sending the rejection anyway stops
// the provider from leaving the permission pending forever.
func Reply(
	api *opencodeclient.Client,
	sessionID string,
	requestID string,
	decision string,
) {
	ctx, cancel := context.WithTimeout(context.Background(), replyTimeout)
	defer cancel()
	_ = api.ReplyPermission(ctx, sessionID, requestID, decision, "")
}

// Await ignores stale decisions from an earlier card. The TUI channel
// is shared for the whole run, so matching on the call id prevents a queued
// answer from approving a tool the user never saw.
func Await(
	ctx context.Context,
	decisions <-chan tuiclient.Decision,
	callID string,
) (tuiclient.Decision, bool) {
	if decisions == nil {
		return tuiclient.Decision{}, false
	}
	for {
		select {
		case decision, ok := <-decisions:
			if !ok {
				return tuiclient.Decision{}, false
			}
			if decision.ID != callID {
				continue
			}
			return decision, true
		case <-ctx.Done():
			return tuiclient.Decision{}, false
		}
	}
}

// jsonText encodes the small argument maps the card understands. An encoding
// failure returns an empty string, which the transcript renders as an empty
// argument block instead of crashing the turn.
func jsonText(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(encoded)
}
