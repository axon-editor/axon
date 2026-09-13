// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

//go:build !unix

package agentcli

func selectResumeSessionPrompt(sessions []agentSessionRecord) (*agentSessionRecord, bool, error) {
	// The non-Unix build keeps resume deterministic without pretending Unix
	// escape-sequence input works everywhere. `axon resume :id` remains the
	// portable way to reopen a saved conversation on these platforms.
	return nil, false, nil
}
