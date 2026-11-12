// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package model

import (
	"sort"
	"strings"

	"github.com/GordenArcher/axon-core/internal/ai"
)

// Row is either a provider heading or a selectable model. Keeping both in
// one slice lets the picker scroll naturally while navigation still skips the
// headings.
type Row struct {
	Header bool
	Label  string
	Model  ai.ModelInfo
}

type modelGroup struct {
	key    string
	label  string
	rank   int
	models []ai.ModelInfo
}

// The gaps between ranks leave room for a future provider that should sit
// between OpenCode's own plans and the third-party catalog without renumbering
// everything.
const (
	axonGroupLabel         = "Axon"
	axonProviderLabel      = "Axon models"
	openCodeProviderRank   = 10
	thirdPartyProviderRank = 20
	openCodeRank           = 0
	openCodeGoRank         = 1
)

// groupedRows keeps Axon's local models first, then OpenCode's own plans,
// then any provider OpenCode can proxy. A flat catalog sorted by id buried the
// local models under dozens of OpenCode entries, which made the picker feel
// like it had lost the model the user actually installed.
func groupedRows(models []ai.ModelInfo) []Row {
	groups := make([]modelGroup, 0, 8)
	index := make(map[string]int, 8)
	for _, model := range models {
		key, label, rank := modelGroupFor(model)
		position, ok := index[key]
		if !ok {
			position = len(groups)
			index[key] = position
			groups = append(groups, modelGroup{key: key, label: label, rank: rank})
		}
		groups[position].models = append(groups[position].models, model)
	}

	sort.SliceStable(groups, func(left, right int) bool {
		if groups[left].rank != groups[right].rank {
			return groups[left].rank < groups[right].rank
		}
		return strings.ToLower(groups[left].label) < strings.ToLower(groups[right].label)
	})

	rows := make([]Row, 0, len(models)+len(groups))
	for _, group := range groups {
		sort.SliceStable(group.models, func(left, right int) bool {
			if group.models[left].Available != group.models[right].Available {
				return group.models[left].Available
			}
			return strings.ToLower(group.models[left].Label) <
				strings.ToLower(group.models[right].Label)
		})
		rows = append(rows, Row{Header: true, Label: group.label})
		for _, model := range group.models {
			rows = append(rows, Row{Label: model.Label, Model: model})
		}
	}
	return rows
}

// modelGroupFor labels the source the same way the sidebar does. ProviderLabel
// alone is not enough because local models report "Axon models" while OpenCode
// reports the plan name, and the picker should not show two Axon headings.
func modelGroupFor(model ai.ModelInfo) (key, label string, rank int) {
	if model.Backend == "opencode" {
		label = strings.TrimSpace(model.ProviderLabel)
		if label == "" {
			label = "OpenCode"
		}
		switch model.ProviderID {
		case "opencode":
			rank = openCodeProviderRank + openCodeRank
		case "opencode-go":
			rank = openCodeProviderRank + openCodeGoRank
		default:
			rank = openCodeProviderRank + 2
		}
		return "opencode:" + model.ProviderID, label, rank
	}

	if model.ProviderLabel == "" || model.ProviderLabel == axonProviderLabel {
		return "axon", axonGroupLabel, 0
	}
	return "provider:" + model.ProviderLabel, model.ProviderLabel, thirdPartyProviderRank
}
