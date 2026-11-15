// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package fuzzy

import "testing"

func TestScorePrefersExactThenPrefixThenSubsequence(t *testing.T) {
	exact, ok := Score("model", "model")
	if !ok {
		t.Fatal("exact match was rejected")
	}
	prefix, ok := Score("mod", "model")
	if !ok {
		t.Fatal("prefix match was rejected")
	}
	subsequence, ok := Score("mdl", "model")
	if !ok {
		t.Fatal("subsequence match was rejected")
	}
	if !(exact > prefix && prefix > subsequence) {
		t.Fatalf("scores out of order: exact=%d prefix=%d subsequence=%d", exact, prefix, subsequence)
	}
}

func TestScoreRejectsMissingLettersAndOrder(t *testing.T) {
	if _, ok := Score("xyz", "model"); ok {
		t.Fatal("unrelated pattern matched")
	}
	if _, ok := Score("ledom", "model"); ok {
		t.Fatal("out-of-order pattern matched")
	}
}

func TestScoreIsCaseInsensitive(t *testing.T) {
	if _, ok := Score("MOD", "model"); !ok {
		t.Fatal("uppercase pattern did not match lowercase target")
	}
}

func TestFilterKeepsInputOrderForEmptyPattern(t *testing.T) {
	values := []string{"alpha", "beta", "gamma"}
	filtered := Filter(values, "", func(value string) string { return value })
	if len(filtered) != len(values) {
		t.Fatalf("empty pattern filtered to %#v", filtered)
	}
	for index := range values {
		if filtered[index] != values[index] {
			t.Fatalf("empty pattern reordered %#v", filtered)
		}
	}
}

func TestFilterRanksAndKeepsMatches(t *testing.T) {
	values := []string{"resume", "model", "clear", "refresh"}
	filtered := Filter(values, "re", func(value string) string { return value })
	if len(filtered) == 0 {
		t.Fatal("filter returned no matches")
	}
	if filtered[0] != "resume" && filtered[0] != "refresh" {
		t.Fatalf("unexpected first match: %#v", filtered)
	}
	for _, value := range filtered {
		if value == "model" {
			t.Fatalf("non-matching item survived: %#v", filtered)
		}
	}
}

func TestFilterFieldsDoesNotMatchAcrossFields(t *testing.T) {
	type item struct {
		label string
		id    string
	}
	filtered := FilterFields([]item{
		{label: "alpha", id: "beta"},
	}, "ab", func(entry item) []string {
		return []string{entry.label, entry.id}
	})
	if len(filtered) != 0 {
		t.Fatalf("pattern matched across fields: %#v", filtered)
	}
}
