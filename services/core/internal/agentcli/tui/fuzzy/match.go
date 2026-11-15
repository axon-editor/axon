// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package fuzzy

import (
	"sort"
	"strings"
)

const (
	exactMatchScore  = 10_000
	prefixMatchScore = 9_000
	consecutiveBonus = 10
	boundaryBonus    = 5
	subsequenceBase  = 1_000
	noMatch          = 0
)

// Score ranks a target against a typed pattern. Exact and prefix matches win
// over subsequences so "/mod" still puts "model" first instead of a command
// whose letters happen to appear later. Empty patterns match everything.
func Score(pattern, target string) (int, bool) {
	pattern = strings.ToLower(strings.TrimSpace(pattern))
	target = strings.ToLower(strings.TrimSpace(target))
	if pattern == "" {
		return 0, true
	}
	if pattern == target {
		return exactMatchScore, true
	}
	if strings.HasPrefix(target, pattern) {
		return prefixMatchScore - len(target), true
	}

	patternRunes := []rune(pattern)
	targetRunes := []rune(target)
	position := 0
	score := subsequenceBase
	first := -1
	last := -1
	for index, character := range targetRunes {
		if position >= len(patternRunes) {
			break
		}
		if character != patternRunes[position] {
			continue
		}
		if first < 0 {
			first = index
		}
		if last >= 0 && index == last+1 {
			score += consecutiveBonus
		}
		if index == 0 || isBoundary(targetRunes[index-1]) {
			score += boundaryBonus
		}
		last = index
		position++
	}
	if position != len(patternRunes) {
		return noMatch, false
	}
	// Penalize how far the match spreads so "res" prefers "resume" over a
	// command where the same letters are scattered across the name.
	return score - (last - first), true
}

func isBoundary(character rune) bool {
	switch character {
	case ' ', '-', '_', '.', '/':
		return true
	default:
		return false
	}
}

// Filter keeps only the items whose key matches the pattern, sorted by score.
// Original order breaks ties so an empty or ambiguous query does not reshuffle
// the catalog every time the user types.
func Filter[T any](items []T, pattern string, key func(T) string) []T {
	return FilterFields(items, pattern, func(item T) []string {
		return []string{key(item)}
	})
}

// FilterFields scores every field independently and keeps the best result.
// Concatenating fields would let a pattern match the tail of one field and the
// head of the next, so "beam" could match a model whose id repeats another
// provider's name.
func FilterFields[T any](items []T, pattern string, fields func(T) []string) []T {
	pattern = strings.TrimSpace(pattern)
	if pattern == "" {
		return items
	}

	type hit struct {
		item  T
		score int
		index int
	}
	hits := make([]hit, 0, len(items))
	for index, item := range items {
		best := -1
		for _, field := range fields(item) {
			score, ok := Score(pattern, field)
			if ok && score > best {
				best = score
			}
		}
		if best < 0 {
			continue
		}
		hits = append(hits, hit{item: item, score: best, index: index})
	}
	sort.SliceStable(hits, func(left, right int) bool {
		if hits[left].score != hits[right].score {
			return hits[left].score > hits[right].score
		}
		return hits[left].index < hits[right].index
	})

	filtered := make([]T, 0, len(hits))
	for _, result := range hits {
		filtered = append(filtered, result.item)
	}
	return filtered
}
