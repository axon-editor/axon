// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package fs

import "testing"

func TestMatchGlobSupportsDoubleStar(t *testing.T) {
	cases := []struct {
		pattern string
		path    string
		want    bool
	}{
		{"**/main.go", "main.go", true},
		{"**/main.go", "apps/editor/main.go", true},
		{"**/main.go", "apps/editor/main.ts", false},
		{"src/**/*.ts", "src/index.ts", true},
		{"src/**/*.ts", "src/deep/index.ts", true},
		{"src/**/*.ts", "src/deep/index.go", false},
		{"src/*.ts", "src/index.ts", true},
		{"src/*.ts", "src/deep/index.ts", false},
		{"*.go", "apps/editor/main.go", true},
		{"app.config.ts", "app.config.ts", true},
		{"app.config.ts", "appXconfig.ts", false},
		{"[ab].go", "a.go", true},
		{"[ab].go", "c.go", false},
		{"src/日本語.go", "src/日本語.go", true},
		{"src/日本語.go", "src/日本.go", false},
	}

	for _, testCase := range cases {
		if got := MatchGlob(testCase.pattern, testCase.path); got != testCase.want {
			t.Fatalf(
				"MatchGlob(%q, %q) = %t, want %t",
				testCase.pattern,
				testCase.path,
				got,
				testCase.want,
			)
		}
	}
}
