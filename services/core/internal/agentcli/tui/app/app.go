// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app/composer"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/app/session"
	apptranscript "github.com/GordenArcher/axon-core/internal/agentcli/tui/app/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	modelpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/model"
	sessionpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/session"
	transcriptview "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/GordenArcher/axon-core/internal/ai"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type Model struct {
	workspace string
	modelID   string
	models    []ai.ModelInfo

	composer     composer.State
	conversation apptranscript.State
	session      session.State

	sessionPicker     sessionpicker.Picker
	sessionPickerOpen bool
	picker            modelpicker.Picker
	pickerOpen        bool

	width    int
	height   int
	viewport viewport.Model
	spinner  spinner.Model
	renderer *transcriptview.Renderer

	selectMode bool
	status     string

	events    chan client.Event
	cancel    context.CancelFunc
	decisions chan client.Decision

	approvalOpen bool
	approval     components.Approval
	approvalID   string

	commandAllowlist *sync.Map
}

type streamEventMsg struct {
	event client.Event
}

const spinnerFPS = time.Second / 10

// NewModel builds the screen state without starting the agent. The TUI owns
// layout and event routing; conversation, session, and composer state live in
// their capability packages so each can be tested without a full screen.
func NewModel(
	workspace, modelID string,
	models []ai.ModelInfo,
	resume bool,
	sessions *store.Store,
) Model {
	viewportModel := viewport.New(80, 20)
	viewportModel.MouseWheelEnabled = true
	viewportModel.MouseWheelDelta = 3

	// A Braille dot sequence keeps the loader readable in any monospace font
	// and animates smoothly at ten frames per second.
	spinnerModel := spinner.New()
	spinnerModel.Spinner = spinner.Spinner{
		Frames: []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
		FPS:    spinnerFPS,
	}
	spinnerModel.Style = theme.StatusActive

	renderer := transcriptview.New()
	renderer.SetWorkspace(workspace)

	model := Model{
		workspace:        workspace,
		modelID:          modelID,
		models:           models,
		composer:         composer.New(),
		conversation:     apptranscript.NewState(),
		session:          session.New(workspace, sessions),
		commandAllowlist: &sync.Map{},
		viewport:         viewportModel,
		spinner:          spinnerModel,
		renderer:         renderer,
		status:           "Ready",
	}
	model.session.Model = modelID

	if sessions != nil && resume {
		options, err := model.session.Options()
		if err == nil && len(options) > 0 {
			model.sessionPicker = sessionpicker.New(options, model.session.ID)
			model.sessionPickerOpen = true
			model.status = "Select a conversation"
		} else {
			model.status = "No saved conversations"
		}
	}

	return model
}

// Init starts the spinner and focuses the composer. The spinner is the only
// long-lived animation; the transcript owns its activity markers separately.
func (m Model) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, m.composer.Input.Focus())
}

// waitForEvent turns the agent channel into Bubble Tea messages. A closed
// channel becomes Done so a crashed producer cannot leave the TUI streaming
// forever.
func waitForEvent(events <-chan client.Event) tea.Cmd {
	return func() tea.Msg {
		event, ok := <-events
		if !ok {
			return streamEventMsg{event: client.Event{Kind: client.Done}}
		}
		return streamEventMsg{event: event}
	}
}

// resolveModelRoute reads the backend from the catalog instead of guessing from
// the id. Axon's local ids and OpenCode ids can both contain slashes in the
// future, and the picker already knows which provider owns the selected entry.
func resolveModelRoute(catalog []ai.ModelInfo, id string) (string, string, string) {
	for _, model := range catalog {
		if model.ID != id {
			continue
		}
		backend := model.Backend
		if backend == "" {
			backend = "axon"
		}
		return backend, model.ProviderID, model.ModelID
	}
	// A restored conversation can name an OpenCode model before the catalog
	// finishes loading. The provider/id shape is enough to keep the turn on the
	// backend that issued the session instead of sending it to core.
	if separator := strings.IndexByte(id, '/'); separator > 0 && separator < len(id)-1 {
		return "opencode", id[:separator], id[separator+1:]
	}
	return "axon", "", ""
}
