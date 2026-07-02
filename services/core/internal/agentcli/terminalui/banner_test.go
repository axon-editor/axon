package terminalui

import (
	"strings"
	"testing"
)

func TestRenderBannerIncludesModeAndWorkspace(t *testing.T) {
	output := renderBanner(BannerOptions{
		Mode:      "Opening workspace in Axon",
		Workspace: "/tmp/project",
	}, "•")

	if !strings.Contains(output, "AXON") {
		t.Fatalf("renderBanner output = %q, want product name", output)
	}
	if !strings.Contains(output, "Opening workspace in Axon") {
		t.Fatalf("renderBanner output = %q, want mode", output)
	}
	if !strings.Contains(output, "/tmp/project") {
		t.Fatalf("renderBanner output = %q, want workspace", output)
	}
}

func TestRenderInlineBannerOmitsWorkspace(t *testing.T) {
	output := renderInlineBanner(BannerOptions{
		Mode:      "Local agent ready",
		Workspace: "/tmp/project",
	}, "•")

	if strings.Contains(output, "/tmp/project") {
		t.Fatalf("renderInlineBanner output = %q, workspace should only appear in the final banner", output)
	}
}
