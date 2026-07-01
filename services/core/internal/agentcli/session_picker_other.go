//go:build !unix

package agentcli

func selectResumeSessionPrompt(sessions []agentSessionRecord) (*agentSessionRecord, bool, error) {
	// The non-Unix build keeps resume deterministic without pretending Unix
	// escape-sequence input works everywhere. `axon resume :id` remains the
	// portable way to reopen a saved conversation on these platforms.
	return nil, false, nil
}
