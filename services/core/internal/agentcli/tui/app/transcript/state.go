// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package transcript

import (
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/client"
	"github.com/GordenArcher/axon-core/internal/agentcli/tui/components"
	thoughtpicker "github.com/GordenArcher/axon-core/internal/agentcli/tui/components/pickers/thought"
	store "github.com/GordenArcher/axon-core/internal/sessions"
)

// State owns everything that changes the visible conversation. Separating it
// from the screen model keeps message mutation testable without constructing a
// viewport, spinner, or session store.
type State struct {
	Messages      []components.Message
	Streaming     bool
	Responding    bool
	ThoughtOpen   bool
	ThoughtPicker thoughtpicker.Picker
}

// NewState starts with the welcome line. It has no id on purpose so persistence
// never mistakes product copy for a user turn.
func NewState() State {
	return State{
		Messages: []components.Message{
			{Role: "assistant", Content: "What are we working on in Axon today?"},
		},
	}
}

// AppendThought extends the live block until it collapses. A new block starts
// after a tool or answer so two separate reasoning phases do not merge into one
// undifferentiated wall of text.
func (s *State) AppendThought(text string) {
	if text == "" {
		return
	}
	last := len(s.Messages) - 1
	if last < 0 || !s.Messages[last].Thinking || s.Messages[last].Collapsed {
		s.Messages = append(s.Messages, components.Message{
			ID:       store.NewID(),
			Role:     "assistant",
			Thinking: true,
			Content:  text,
		})
		return
	}
	s.Messages[last].Content += text
}

// CollapseThinking runs when the answer or a tool starts. The loader then moves
// to the active surface instead of leaving every old thought expanded.
func (s *State) CollapseThinking() {
	for index := range s.Messages {
		if s.Messages[index].Thinking {
			s.Messages[index].Collapsed = true
		}
	}
}

// ToggleThinking expands or collapses every thought block together. Toggling
// only the newest block left older reasoning permanently collapsed with no way
// to inspect it.
func (s *State) ToggleThinking() {
	collapsed := false
	for index := len(s.Messages) - 1; index >= 0; index-- {
		if s.Messages[index].Thinking {
			collapsed = s.Messages[index].Collapsed
			break
		}
	}
	next := !collapsed
	for index := range s.Messages {
		if s.Messages[index].Thinking {
			s.Messages[index].Collapsed = next
		}
	}
}

// ToggleToolOutput expands or collapses the most recent tool card. It uses the
// card order rather than a per-card key so the shortcut works without moving
// focus into the transcript.
func (s *State) ToggleToolOutput() {
	for index := len(s.Messages) - 1; index >= 0; index-- {
		tool := s.Messages[index].Tool
		if tool != nil {
			tool.Expanded = !tool.Expanded
			return
		}
	}
}

// AppendWaitingTool creates the approval card before the provider runs the
// tool. The same call id later turns this card into the running row instead of
// adding a duplicate.
func (s *State) AppendWaitingTool(event client.Event) {
	s.Messages = append(s.Messages, components.Message{
		ID:   store.NewID(),
		Role: "tool",
		Tool: &components.Tool{
			CallID:    event.ToolCallID,
			Name:      event.ToolName,
			Arguments: event.Arguments,
			Waiting:   true,
		},
	})
}

// AppendTool merges a real tool start into a waiting approval card. A second
// card for the same provider call id would make one action look like two.
func (s *State) AppendTool(event client.Event) {
	for index := len(s.Messages) - 1; index >= 0; index-- {
		tool := s.Messages[index].Tool
		if tool == nil || tool.CallID != event.ToolCallID {
			continue
		}
		tool.Running = true
		tool.Waiting = false
		if event.Approval != "" {
			tool.Approval = event.Approval
		}
		if tool.Name == "" {
			tool.Name = event.ToolName
		}
		if tool.Arguments == "" {
			tool.Arguments = event.Arguments
		}
		return
	}

	s.Messages = append(s.Messages, components.Message{
		ID:   store.NewID(),
		Role: "tool",
		Tool: &components.Tool{
			CallID:    event.ToolCallID,
			Name:      event.ToolName,
			Arguments: event.Arguments,
			Running:   true,
			Approval:  event.Approval,
		},
	})
}

// FinishTool writes the result onto the matching card, or creates one when a
// stream attached after the tool started.
func (s *State) FinishTool(event client.Event) {
	for index := len(s.Messages) - 1; index >= 0; index-- {
		tool := s.Messages[index].Tool
		if tool == nil || tool.CallID != event.ToolCallID {
			continue
		}
		tool.Result = event.Result
		tool.OK = event.OK
		tool.Running = false
		tool.Waiting = false
		tool.DurationMS = event.DurationMS
		if event.Approval != "" {
			tool.Approval = event.Approval
		}
		if tool.Name == "" {
			tool.Name = event.ToolName
		}
		return
	}

	// A result without a start can happen when a stream attaches mid-turn or an
	// older core only sent the completion. Showing the card is still better than
	// dropping evidence that the agent touched the workspace.
	s.Messages = append(s.Messages, components.Message{
		ID:   store.NewID(),
		Role: "tool",
		Tool: &components.Tool{
			CallID:     event.ToolCallID,
			Name:       event.ToolName,
			Result:     event.Result,
			OK:         event.OK,
			Approval:   event.Approval,
			DurationMS: event.DurationMS,
		},
	})
}

// AppendAssistantDelta keeps answer text in one block until a thought or tool
// interrupts it. Splitting every token would create one transcript row per
// streamed chunk.
func (s *State) AppendAssistantDelta(delta string) {
	last := len(s.Messages) - 1
	if last < 0 ||
		s.Messages[last].Thinking ||
		s.Messages[last].Role != "assistant" {
		s.Messages = append(s.Messages, components.Message{
			ID:   store.NewID(),
			Role: "assistant",
		})
		last = len(s.Messages) - 1
	}
	s.Messages[last].Content += delta
}

// AppendError attaches to the current answer when one exists. A run that fails
// mid-answer should show the failure beside the partial text, not as a separate
// orphaned row.
func (s *State) AppendError(message string) {
	last := len(s.Messages) - 1
	if last < 0 ||
		s.Messages[last].Thinking ||
		s.Messages[last].Role != "assistant" ||
		s.Messages[last].Content == "" {
		s.Messages = append(s.Messages, components.Message{
			ID:      store.NewID(),
			Role:    "assistant",
			Content: "Error: " + message,
		})
		return
	}
	s.Messages[last].Content += "\n\nError: " + message
}

func (s *State) ToolByCallID(callID string) *components.Tool {
	for index := len(s.Messages) - 1; index >= 0; index-- {
		tool := s.Messages[index].Tool
		if tool != nil && tool.CallID == callID {
			return tool
		}
	}
	return nil
}

func (s *State) MarkApproval(decision client.Decision) {
	tool := s.ToolByCallID(decision.ID)
	if tool == nil {
		return
	}
	tool.Waiting = false
	if decision.Approved {
		tool.Running = true
		tool.Approval = "once"
		if decision.AllowSession {
			tool.Approval = "session"
		}
		return
	}
	tool.Running = false
	tool.OK = false
	tool.Approval = "denied"
	tool.Result = "The user declined to run " + tool.Name + "."
}

// HasContextualActivity reports whether the active thought or tool already owns
// the loader. The bottom Working line is only for the gap before the first
// content arrives.
func (s State) HasContextualActivity() bool {
	if len(s.Messages) == 0 {
		return false
	}
	last := s.Messages[len(s.Messages)-1]
	if last.Thinking && last.Content != "" {
		return true
	}
	return last.Tool != nil && (last.Tool.Running || last.Tool.Waiting)
}

// ActiveMessage returns the assistant block that should show the live cursor.
// Thinking and tool rows never carry it, even while the turn is streaming.
func (s State) ActiveMessage() int {
	if !s.Streaming || len(s.Messages) == 0 {
		return -1
	}
	last := len(s.Messages) - 1
	if s.Messages[last].Thinking || s.Messages[last].Role != "assistant" {
		return -1
	}
	return last
}

// OpenThoughtPicker starts on the newest thought because that is the one the
// user just watched stream, while still exposing every earlier block.
func (s *State) OpenThoughtPicker() bool {
	options := s.ThoughtOptions()
	if len(options) == 0 {
		return false
	}
	s.ThoughtPicker = thoughtpicker.New(options, len(options)-1)
	s.ThoughtOpen = true
	return true
}

func (s *State) ToggleSelectedThought() {
	option := s.ThoughtPicker.Selected()
	if option.Index < 0 || option.Index >= len(s.Messages) ||
		!s.Messages[option.Index].Thinking {
		return
	}
	s.Messages[option.Index].Collapsed = !s.Messages[option.Index].Collapsed
}

// RebuildThoughtPicker keeps the highlighted position after a Space toggle.
// Rebuilding from scratch would jump the selection to the newest thought.
func (s *State) RebuildThoughtPicker(position int) {
	s.ThoughtPicker = thoughtpicker.New(s.ThoughtOptions(), position)
}

func (s State) ThoughtOptions() []thoughtpicker.Option {
	options := make([]thoughtpicker.Option, 0)
	for index, message := range s.Messages {
		if !message.Thinking {
			continue
		}
		options = append(options, thoughtpicker.Option{
			Index:     index,
			Preview:   message.Content,
			Collapsed: message.Collapsed,
		})
	}
	return options
}
