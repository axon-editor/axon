// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"testing"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	tea "github.com/charmbracelet/bubbletea"
)

func TestApprovalAllowsOnce(t *testing.T) {
	decisions := make(chan client.Decision, 1)
	model := Model{decisions: decisions}
	model.openApproval(client.Event{
		ToolCallID: "call-1",
		ToolName:   "write_file",
		Arguments:  `{"path":"main.go"}`,
		Summary:    "main.go",
		Details:    "Write 12 bytes to main.go",
	})
	if !model.approvalOpen || len(model.messages) != 1 || model.messages[0].Tool == nil {
		t.Fatalf("approval did not open: %#v", model)
	}

	updated, _ := model.updateApproval(keyMsg("y"))
	model = updated.(Model)
	if model.approvalOpen {
		t.Fatal("approval stayed open after a decision")
	}
	decision := <-decisions
	if !decision.Approved || decision.ID != "call-1" {
		t.Fatalf("unexpected decision: %#v", decision)
	}
	tool := model.messages[0].Tool
	if tool.Waiting || !tool.Running || tool.Approval != "once" {
		t.Fatalf("tool card did not move to running: %#v", tool)
	}
}

func TestApprovalCanDeny(t *testing.T) {
	decisions := make(chan client.Decision, 1)
	model := Model{decisions: decisions}
	model.openApproval(client.Event{
		ToolCallID:   "call-2",
		ToolName:     "run_command",
		Arguments:    `{"command":"rm -rf build"}`,
		Summary:      "rm -rf build",
		Details:      "Remove the build folder",
		AllowSession: true,
	})

	updated, _ := model.updateApproval(keyMsg("n"))
	model = updated.(Model)
	decision := <-decisions
	if decision.Approved {
		t.Fatal("deny key produced an approval")
	}
	tool := model.messages[0].Tool
	if tool.Waiting || tool.Running || tool.OK || tool.Approval != "denied" {
		t.Fatalf("denied card has the wrong state: %#v", tool)
	}
	if tool.Result == "" {
		t.Fatal("denied card is missing its result text")
	}
}

func TestApprovalAllowSessionRequiresPermission(t *testing.T) {
	decisions := make(chan client.Decision, 1)
	model := Model{decisions: decisions}
	model.openApproval(client.Event{
		ToolCallID:   "call-3",
		ToolName:     "write_file",
		Summary:      "main.go",
		AllowSession: false,
	})

	updated, _ := model.updateApproval(keyMsg("a"))
	model = updated.(Model)
	if !model.approvalOpen {
		t.Fatal("allow-for-run should be ignored when the tool does not offer it")
	}
	select {
	case decision := <-decisions:
		t.Fatalf("unexpected decision: %#v", decision)
	default:
	}
}

func keyMsg(value string) tea.KeyMsg {
	return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(value)}
}
