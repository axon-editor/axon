// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package state

import (
	"path/filepath"
	"testing"
)

func TestDirPrefersExplicitOverride(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("AXON_STATE_DIR", filepath.Join(home, "custom-axon"))

	if got := Dir(); got != filepath.Join(home, "custom-axon") {
		t.Fatalf("Dir() = %q", got)
	}
}

func TestDirUsesDevelopmentChannel(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("AXON_STATE_DIR", "")
	t.Setenv("NODE_ENV", "development")

	if got := Dir(); got != filepath.Join(home, ".axon-dev") {
		t.Fatalf("Dir() = %q", got)
	}
}

func TestDirUsesProductionChannelByDefault(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("AXON_STATE_DIR", "")
	t.Setenv("NODE_ENV", "")

	if got := Dir(); got != filepath.Join(home, ".axon") {
		t.Fatalf("Dir() = %q", got)
	}
}
