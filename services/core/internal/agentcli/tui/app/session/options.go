// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package session

import (
	"errors"

	sessionpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/session"
)

// Options lists the saved conversations for the picker. Returning an error
// instead of an empty slice lets the caller distinguish "nothing saved" from
// "the database could not be read".
func (s *State) Options() ([]sessionpicker.Option, error) {
	if s.Store == nil {
		return nil, errors.New("session storage is unavailable")
	}
	summaries, err := s.Store.List(s.Workspace)
	if err != nil {
		return nil, err
	}
	options := make([]sessionpicker.Option, 0, len(summaries))
	for _, summary := range summaries {
		options = append(options, sessionpicker.Option{
			ID:      summary.ID,
			Title:   summary.Title,
			Model:   summary.Model,
			Source:  summary.Source,
			Updated: summary.UpdatedAt.Local().Format("Jan 2 15:04"),
			Current: summary.ID == s.ID,
		})
	}
	return options, nil
}
