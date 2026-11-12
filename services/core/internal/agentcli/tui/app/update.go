// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package app

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/GordenArcher/axon-core/internal/agentcli/configstore"
	apptranscript "github.com/GordenArcher/axon-core/internal/agentcli/tui/app/transcript"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client/agent"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	modelpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/model"
	sessionpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/session"
	store "github.com/GordenArcher/axon-core/internal/sessions"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
)

const (
	eventBuffer    = 64
	decisionBuffer = 1
)

// Update is the top-level event router. Overlays get first refusal on keys so
// typing in the textarea cannot leak into an open picker.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.layout()
		return m, nil

	case tea.KeyMsg:
		if msg.String() == "ctrl+c" {
			if m.cancel != nil {
				m.cancel()
			}
			return m, tea.Quit
		}
		if m.approvalOpen {
			return m.updateApproval(msg)
		}
		if m.conversation.ThoughtOpen {
			return m.updateThoughtPicker(msg)
		}
		if m.sessionPickerOpen {
			return m.updateSessionPicker(msg)
		}
		if m.pickerOpen {
			return m.updatePicker(msg)
		}
		if m.composer.Open {
			switch msg.String() {
			case "up":
				m.composer.MoveMenu(-1)
				return m, nil
			case "down":
				m.composer.MoveMenu(1)
				return m, nil
			case "tab":
				if command, ok := m.composer.SelectedCommand(); ok {
					if m.composer.SetValue("/" + command.Name) {
						m.layout()
					}
				}
				return m, nil
			case "esc":
				m.closeSlashMenu()
				return m, nil
			case "enter":
				return m.runSlashSelection()
			}
		}

		switch msg.String() {
		case "esc":
			if m.conversation.Streaming && m.cancel != nil {
				m.cancel()
				m.status = "Cancelling..."
			} else {
				m.composer.Reset()
			}
			return m, nil
		case "enter":
			if m.conversation.Streaming {
				return m, nil
			}
			return m.sendPrompt(m.composer.Value())
		case "pgup":
			m.viewport.ViewUp()
			return m, nil
		case "pgdown":
			m.viewport.ViewDown()
			return m, nil
		case "ctrl+t":
			if !m.conversation.OpenThoughtPicker() {
				m.status = "No thoughts in this conversation"
				return m, nil
			}
			m.status = "Thoughts"
			return m, nil
		case "ctrl+o":
			m.conversation.ToggleToolOutput()
			m.updateTranscript()
			return m, nil
		case "ctrl+y":
			// Enter a terminal-native selection mode so the user can drag and
			// copy. Restoring cell-motion capture brings wheel scrolling back.
			m.selectMode = !m.selectMode
			if m.selectMode {
				m.status = "Selection mode · drag to copy · Ctrl+Y to return"
				return m, tea.DisableMouse
			}
			m.status = "Ready"
			return m, tea.EnableMouseCellMotion
		}

		command := m.composer.Update(msg)
		m.refreshSlashMenu()
		return m, command

	case tea.MouseMsg:
		if msg.Button == tea.MouseButtonWheelUp {
			m.viewport.ScrollUp(m.viewport.MouseWheelDelta)
		}
		if msg.Button == tea.MouseButtonWheelDown {
			m.viewport.ScrollDown(m.viewport.MouseWheelDelta)
		}
		return m, nil

	case streamEventMsg:
		return m.HandleStreamEvent(msg.event)

	case spinner.TickMsg:
		var command tea.Cmd
		m.spinner, command = m.spinner.Update(msg)
		// Keep ticking only while a turn is active; the next prompt restarts it.
		if m.conversation.Streaming {
			// The spinner is also the active thought/tool marker, so the
			// transcript has to repaint on each frame.
			m.updateTranscript()
			return m, command
		}
		return m, nil
	}

	return m, nil
}

// sendPrompt owns the handoff from typing to the agent. It persists the user
// turn before starting the goroutine so a crash during the first token still
// leaves a resumable conversation.
func (m Model) sendPrompt(value string) (tea.Model, tea.Cmd) {
	prompt := strings.TrimSpace(value)
	if prompt == "" {
		return m, nil
	}
	if strings.HasPrefix(prompt, "/") {
		return m.handleSlash(prompt)
	}

	history := apptranscript.History(m.conversation.Messages)
	backend, providerID, modelID := resolveModelRoute(m.models, m.modelID)
	if backend != m.session.Backend {
		// The route is the source of truth if the model was changed through the
		// config file or an older catalog. Never hand one backend a session id
		// issued by another.
		m.session.BackendSessionID = ""
		m.session.Backend = backend
	}
	m.session.Model = m.modelID
	m.conversation.Messages = append(m.conversation.Messages, components.Message{
		ID:      store.NewID(),
		Role:    "user",
		Content: prompt,
	})
	if m.session.Title == "" || m.session.Title == store.DefaultTitle {
		m.session.Title = store.Title(prompt)
	}
	m.composer.Reset()
	m.conversation.Streaming = true
	m.conversation.Responding = false
	m.status = "Working"

	events := make(chan client.Event, eventBuffer)
	decisions := make(chan client.Decision, decisionBuffer)
	ctx, cancel := context.WithCancel(context.Background())
	allowlist := m.commandAllowlist
	if allowlist == nil {
		allowlist = &sync.Map{}
		m.commandAllowlist = allowlist
	}
	m.events = events
	m.decisions = decisions
	m.cancel = cancel
	m.approvalOpen = false
	m.approval = components.Approval{}
	m.approvalID = ""
	m.updateTranscript()
	// Persist the question before the model answers. If the process dies
	// mid-stream the user can still resume and see what was asked.
	m.saveSession()

	go agent.Run(ctx, client.Request{
		Prompt:           prompt,
		FolderPath:       m.workspace,
		Model:            m.modelID,
		History:          history,
		Backend:          backend,
		ProviderID:       providerID,
		ModelID:          modelID,
		BackendSessionID: m.session.BackendSessionID,
		Decisions:        decisions,
		CommandAllowed: func(command string) bool {
			_, ok := allowlist.Load(command)
			return ok
		},
		AllowCommand: func(command string) {
			allowlist.Store(command, true)
		},
	}, events)

	return m, tea.Batch(waitForEvent(events), m.spinner.Tick)
}

// handleSlash keeps the command list in the screen model because each command
// mutates a different capability: session, transcript, composer, or the
// process itself.
func (m Model) handleSlash(prompt string) (tea.Model, tea.Cmd) {
	m.composer.Reset()
	switch strings.ToLower(prompt) {
	case "/quit", "/exit":
		return m, tea.Quit
	case "/clear", "/new":
		m.conversation.Messages = nil
		m.session.Reset()
		m.session.Model = m.modelID
		m.approvalOpen = false
		m.approval = components.Approval{}
		m.approvalID = ""
		m.conversation.ThoughtOpen = false
		m.decisions = nil
		m.status = "Ready"
	case "/model":
		if len(m.models) == 0 {
			m.conversation.Messages = append(m.conversation.Messages, components.Message{
				Role:    "assistant",
				Content: "No models reported by the runtime.",
			})
		} else {
			m.picker = modelpicker.New(m.models, m.modelID)
			m.pickerOpen = true
			m.status = "Select a model"
		}
	case "/resume", "/sessions":
		options, err := m.session.Options()
		if err != nil {
			m.conversation.Messages = append(m.conversation.Messages, components.Message{
				Role:    "assistant",
				Content: "Could not read saved conversations.",
			})
		} else if len(options) == 0 {
			m.conversation.Messages = append(m.conversation.Messages, components.Message{
				Role:    "assistant",
				Content: "No saved conversations for this workspace.",
			})
		} else {
			m.sessionPicker = sessionpicker.New(options, m.session.ID)
			m.sessionPickerOpen = true
			m.status = "Select a conversation"
		}
	case "/select":
		m.selectMode = true
		m.status = "Selection mode · drag to copy · Ctrl+Y to return"
		m.updateTranscript()
		return m, tea.DisableMouse
	case "/status":
		m.conversation.Messages = append(m.conversation.Messages, components.Message{
			Role: "assistant",
			Content: strings.Join([]string{
				"Model: " + m.modelID,
				"Session: " + m.session.Title + " (" + m.session.ID + ")",
				"Workspace: " + m.workspace,
				"Messages: " + fmt.Sprintf("%d", len(m.conversation.Messages)),
			}, "\n"),
		})
	case "/help":
		m.conversation.Messages = append(m.conversation.Messages, components.Message{
			Role: "assistant",
			Content: strings.Join([]string{
				"Commands:",
				"/new      start a new conversation",
				"/clear    clear the transcript and start new",
				"/model    choose a model",
				"/resume   resume a saved conversation",
				"/select   enter selection mode for copy",
				"/status   show session details",
				"/help     show this list",
				"/quit     exit Axon",
				"",
				"Keys: Enter send, Shift+Enter newline, Esc cancel, Ctrl+T thoughts, Ctrl+O tool output, Ctrl+C quit.",
				"Scroll with the mouse wheel or PgUp/PgDn. Ctrl+Y enters selection mode for native copy; press it again to return.",
			}, "\n"),
		})
	default:
		m.conversation.Messages = append(m.conversation.Messages, components.Message{
			Role:    "assistant",
			Content: "Unknown command. Try /help.",
		})
	}
	m.updateTranscript()
	return m, nil
}

// runSlashSelection executes the highlighted command. Reset closes the menu
// before handleSlash runs so a command that opens another overlay does not
// leave the slash list underneath it.
func (m Model) runSlashSelection() (tea.Model, tea.Cmd) {
	command, ok := m.composer.SelectedCommand()
	if !ok {
		return m, nil
	}
	m.composer.Open = false
	m.composer.Reset()
	m.layout()
	return m.handleSlash("/" + command.Name)
}

// refreshSlashMenu only relayouts when the menu rank changed height. Doing it
// on every keystroke would make the transcript jump while the user types.
func (m *Model) refreshSlashMenu() {
	if m.composer.RefreshMenu() {
		m.layout()
	}
}

// closeSlashMenu exits the menu without clearing the typed text, so Escape can
// dismiss the list while keeping the command in the composer.
func (m *Model) closeSlashMenu() {
	if m.composer.CloseMenu() {
		m.layout()
	}
}

// updateSessionPicker treats every printable rune as search input. The list is
// full-screen, so there is no separate search field to focus.
func (m Model) updateSessionPicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		if m.sessionPicker.Query() != "" {
			m.sessionPicker.ClearQuery()
			return m, nil
		}
		m.sessionPickerOpen = false
		m.status = "Ready"
	case "up":
		m.sessionPicker.Move(-1)
	case "down":
		m.sessionPicker.Move(1)
	case "enter":
		if id := m.sessionPicker.SelectedID(); id != "" {
			m.sessionPickerOpen = false
			m.loadSession(id)
			return m, nil
		}
	case "backspace", "ctrl+h":
		m.sessionPicker.Backspace()
	case "ctrl+u":
		m.sessionPicker.ClearQuery()
	case " ":
		m.sessionPicker.AppendQuery(" ")
	default:
		if msg.Type == tea.KeyRunes && len(msg.Runes) > 0 {
			m.sessionPicker.AppendQuery(string(msg.Runes))
		}
	}
	return m, nil
}

// updatePicker writes the selected model to config as soon as it is chosen.
// The next terminal launch then starts on the model the user last used instead
// of the default Axon model.
func (m Model) updatePicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		m.pickerOpen = false
		m.status = "Ready"
	case "up", "k":
		m.picker.Move(-1)
	case "down", "j":
		m.picker.Move(1)
	case "enter":
		if id := m.picker.SelectedID(); id != "" {
			if !m.picker.SelectedAvailable() {
				m.status = "Model is not installed"
				return m, nil
			}
			backend, _, _ := resolveModelRoute(m.models, id)
			// A provider session id only means something to the backend that
			// issued it. Switching away from OpenCode clears it so the next
			// turn starts a fresh provider session with the CLI transcript
			// instead of trying to resume an id the new backend never saw.
			if backend != m.session.Backend {
				m.session.BackendSessionID = ""
				m.session.Backend = backend
			}
			m.modelID = id
			m.session.Model = id
			_ = configstore.Save(configstore.Config{SelectedModel: id})
		}
		m.status = "Ready"
		m.pickerOpen = false
	}
	return m, nil
}

// updateApproval only accepts an allow-for-session answer when the tool offered
// it. Otherwise the TUI would grant a broader permission than the agent asked
// for.
func (m Model) updateApproval(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	decision := client.Decision{ID: m.approvalID}
	switch msg.String() {
	case "y", "enter":
		decision.Approved = true
	case "a":
		if !m.approval.AllowSession {
			return m, nil
		}
		decision.Approved = true
		decision.AllowSession = true
	case "n", "esc":
		decision.Approved = false
	default:
		return m, nil
	}

	m.sendDecision(decision)
	m.approvalOpen = false
	m.conversation.MarkApproval(decision)
	if decision.Approved {
		m.status = "Running..."
	} else {
		m.status = "Denied"
	}
	m.updateTranscript()
	return m, nil
}

// openApproval creates the waiting card before the decision exists. The same
// call id turns that card into the running row, so approve and deny both update
// one visible entry instead of adding a second card later.
func (m *Model) openApproval(event client.Event) {
	m.approval = components.Approval{
		ToolName:     event.ToolName,
		Summary:      event.Summary,
		Details:      event.Details,
		AllowSession: event.AllowSession,
	}
	m.approvalID = event.ToolCallID
	m.approvalOpen = true
	m.status = "Waiting for approval"
	m.conversation.AppendWaitingTool(event)
}

// sendDecision is deliberately non-blocking. The agent is waiting on the
// channel, so the buffer is empty in normal use; a stale decision must not
// freeze the TUI if the run was cancelled at the same moment.
func (m *Model) sendDecision(decision client.Decision) {
	if m.decisions == nil {
		return
	}
	select {
	case m.decisions <- decision:
	default:
	}
}

// updateThoughtPicker keeps Enter as the "open in transcript" action and Space
// as the in-place toggle. Mixing those two made it impossible to inspect one
// thought without losing the picker.
func (m Model) updateThoughtPicker(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "ctrl+t":
		m.conversation.ThoughtOpen = false
		m.status = "Ready"
		m.updateTranscript()
	case "up", "k":
		m.conversation.ThoughtPicker.Move(-1)
	case "down", "j":
		m.conversation.ThoughtPicker.Move(1)
	case "enter":
		option := m.conversation.ThoughtPicker.Selected()
		m.conversation.ToggleSelectedThought()
		// Closing on Enter is deliberate: the picker only has room for previews,
		// so the expanded reasoning is visible only after returning to the
		// transcript.
		m.conversation.ThoughtOpen = false
		m.status = "Ready"
		m.updateTranscript()
		m.scrollToMessage(option.Index)
	case " ":
		m.conversation.ToggleSelectedThought()
		m.conversation.RebuildThoughtPicker(m.conversation.ThoughtPicker.SelectedPosition())
		m.updateTranscript()
	case "a":
		option := m.conversation.ThoughtPicker.Selected()
		m.conversation.ToggleThinking()
		m.conversation.ThoughtOpen = false
		m.status = "Ready"
		m.updateTranscript()
		m.scrollToMessage(option.Index)
	}
	return m, nil
}

// scrollToMessage puts an expanded thought back on screen after the picker
// closes. Without it a long transcript stays pinned to the bottom and the
// reasoning the user just opened is still invisible.
func (m *Model) scrollToMessage(index int) {
	if index < 0 || index >= len(m.conversation.Messages) || m.renderer == nil {
		return
	}
	id := m.conversation.Messages[index].ID
	if id == "" {
		return
	}
	if offset, ok := m.renderer.OffsetFor(id); ok {
		m.viewport.SetYOffset(max(0, offset-1))
	}
}

// HandleStreamEvent is exported for tests that need to drive the same state
// machine the agent channel uses. It keeps tool cards, thoughts, and session
// ids in sync without starting a provider run.
func (m Model) HandleStreamEvent(event client.Event) (tea.Model, tea.Cmd) {
	switch event.Kind {
	case client.Status:
		m.status = event.Text
	case client.Thought:
		m.conversation.Responding = false
		m.conversation.AppendThought(event.Text)
		m.updateTranscript()
	case client.Delta:
		m.conversation.Responding = true
		m.conversation.CollapseThinking()
		m.conversation.AppendAssistantDelta(event.Text)
		m.updateTranscript()
	case client.ApprovalRequest:
		m.conversation.Responding = false
		m.openApproval(event)
		m.updateTranscript()
	case client.ToolStart:
		m.conversation.Responding = false
		// Thinking is complete once a tool starts; collapse it so the loader
		// moves from the thought header to the running tool card.
		m.conversation.CollapseThinking()
		m.conversation.AppendTool(event)
		m.status = "Running " + event.ToolName + "..."
		m.updateTranscript()
	case client.ToolResult:
		m.conversation.FinishTool(event)
		m.status = "Thinking..."
		m.updateTranscript()
		// Persist each completed tool card immediately. A long tool loop can
		// span many seconds, and a crash should not erase the work already done.
		m.saveSession()
	case client.Session:
		// Persist the provider session as soon as it exists. A crash during the
		// first answer would otherwise leave a resumable transcript that cannot
		// continue on the provider side.
		m.session.BackendSessionID = event.BackendSessionID
		m.saveSession()
	case client.Done:
		m.finishStream("Ready")
		return m, nil
	case client.Cancelled:
		m.finishStream("Cancelled")
		return m, nil
	case client.Error:
		m.conversation.AppendError(event.Text)
		m.finishStream("Error")
		return m, nil
	}

	if m.conversation.Streaming && m.events != nil {
		return m, waitForEvent(m.events)
	}
	return m, nil
}

// finishStream collapses the live thought block and persists the turn before
// clearing the channel. Saving here is what makes cancel and error paths
// resumable instead of leaving a half-written conversation in memory only.
func (m *Model) finishStream(status string) {
	m.conversation.CollapseThinking()
	m.updateTranscript()
	m.conversation.Streaming = false
	m.conversation.Responding = false
	m.status = status
	m.cancel = nil
	m.events = nil
	m.decisions = nil
	m.approvalOpen = false
	m.approval = components.Approval{}
	m.approvalID = ""
	m.conversation.ThoughtOpen = false
	m.saveSession()
}

// loadSession installs the saved rows and the model that produced them. The
// provider id travels separately because the model picker can change the
// backend before the next prompt.
func (m *Model) loadSession(id string) {
	messages, err := m.session.Load(id)
	if err != nil {
		m.status = "Could not load conversation"
		return
	}
	m.conversation.Messages = messages
	if m.session.Model != "" {
		m.modelID = m.session.Model
	}
	m.status = "Ready"
	m.updateTranscript()
}

// saveSession is deliberately fire-and-forget. Losing a write is bad, but
// blocking the stream on SQLite would stall the answer the user is watching.
func (m *Model) saveSession() {
	if err := m.session.Save(m.conversation.Messages); err != nil {
		m.status = "Could not save conversation"
	}
}
