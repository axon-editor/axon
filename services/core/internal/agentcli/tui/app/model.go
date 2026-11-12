// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	modelpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/model"
	sessionpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/session"
	thoughtpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/thought"
	slashmenu "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/slash"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/theme"
	"github.com/GordenArcher/axon-core/internal/ai"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type Model struct {
	workspace         string
	modelID           string
	models            []ai.ModelInfo
	sessionID         string
	sessionTitle      string
	sessionSource     string
	sessionBackend    string
	backendSessionID  string
	sessionCreated    time.Time
	sessions          *store.Store
	persisted         map[string]bool
	sessionPicker     sessionpicker.Picker
	sessionPickerOpen bool
	slashMenu         slashmenu.Menu
	slashOpen         bool
	width             int
	height            int
	viewport          viewport.Model
	textarea          textarea.Model
	spinner           spinner.Model
	renderer          *transcript.Renderer
	messages          []components.Message
	picker            modelpicker.Picker
	pickerOpen        bool
	streaming         bool
	responding        bool
	selectMode        bool
	status            string
	events            chan client.Event
	cancel            context.CancelFunc
	decisions         chan client.Decision
	approvalOpen      bool
	approval          components.Approval
	approvalID        string
	thoughtPicker     thoughtpicker.Picker
	thoughtOpen       bool
	commandAllowlist  *sync.Map
}

type streamEventMsg struct {
	event client.Event
}

func NewModel(
	workspace, modelID string,
	models []ai.ModelInfo,
	resume bool,
	sessions *store.Store,
) Model {
	input := textarea.New()
	input.Placeholder = "Ask Axon..."
	// The Axon mark is the prompt, not a generic shell chevron. It also keeps
	// user turns and the composer visually tied to the product.
	input.Prompt = "Λ "
	input.SetPromptFunc(2, func(line int) string {
		if line == 0 {
			return "Λ "
		}
		return "  "
	})
	// The textarea's default cursor line paints a background behind the line
	// being typed. The composer should stay transparent.
	input.FocusedStyle.CursorLine = lipgloss.NewStyle()
	input.BlurredStyle.CursorLine = lipgloss.NewStyle()
	input.FocusedStyle.Prompt = theme.Prompt
	input.BlurredStyle.Prompt = theme.Prompt
	input.FocusedStyle.Placeholder = theme.Subtle
	input.FocusedStyle.Text = theme.Foreground
	input.CharLimit = 0
	input.ShowLineNumbers = false
	input.SetHeight(3)
	input.SetWidth(80)
	// Enter sends the prompt; Shift+Enter and friends keep the multiline escape
	// hatch users expect from a terminal agent.
	input.KeyMap.InsertNewline = key.NewBinding(
		key.WithKeys("shift+enter", "alt+enter", "ctrl+j"),
		key.WithHelp("shift+enter", "newline"),
	)
	_ = input.Focus()

	viewportModel := viewport.New(80, 20)
	viewportModel.MouseWheelEnabled = true
	viewportModel.MouseWheelDelta = 3

	// A Braille dot sequence keeps the loader readable in any monospace font
	// and animates smoothly at ten frames per second.
	spinnerModel := spinner.New()
	spinnerModel.Spinner = spinner.Spinner{
		Frames: []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
		FPS:    time.Second / 10,
	}
	spinnerModel.Style = theme.StatusActive

	renderer := transcript.New()
	renderer.SetWorkspace(workspace)

	model := Model{
		workspace:        workspace,
		modelID:          modelID,
		models:           models,
		sessionID:        store.NewID(),
		sessionTitle:     store.DefaultTitle,
		sessionSource:    "cli",
		sessionBackend:   "axon",
		sessionCreated:   time.Now(),
		sessions:         sessions,
		persisted:        make(map[string]bool),
		commandAllowlist: &sync.Map{},
		viewport:         viewportModel,
		textarea:         input,
		spinner:          spinnerModel,
		renderer:         renderer,
		messages: []components.Message{
			{Role: "assistant", Content: "What are we working on in Axon today?"},
		},
		status: "Ready",
	}

	if sessions != nil && resume {
		summaries, err := sessions.List(workspace)
		if err == nil && len(summaries) > 0 {
			model.sessionPicker = sessionpicker.New(
				sessionOptions(summaries, model.sessionID),
				model.sessionID,
			)
			model.sessionPickerOpen = true
			model.status = "Select a conversation"
		} else {
			model.status = "No saved conversations"
		}
	}

	return model
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(m.spinner.Tick, m.textarea.Focus())
}

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
