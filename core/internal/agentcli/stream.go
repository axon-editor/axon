package agentcli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/GordenArcher/axon-core/internal/ai"
)

var errStreamInterrupted = errors.New("Axon stream interrupted.")

// streamRequestInput is the small command-level shape before it becomes the
// full ai.ChatRequest sent to core. Keeping this separate prevents ask and
// commit from needing to know about every renderer chat field.
type streamRequestInput struct {
	Action       string
	Prompt       string
	FolderPath   string
	Diagnostics  []ai.Diagnostic
	GitDiff      string
	Conversation []ai.ConversationMessage
}

// streamEnvelope is the NDJSON envelope emitted by axon-core for each stream
// line. The CLI parses the same success/error contract as the renderer, so
// terminal behavior stays aligned with the app instead of inventing a second
// response format.
type streamEnvelope struct {
	Status     string              `json:"status"`
	HTTPStatus int                 `json:"http_status"`
	Message    string              `json:"message"`
	Data       json.RawMessage     `json:"data"`
	Errors     map[string][]string `json:"errors"`
	Code       any                 `json:"code"`
	RequestID  string              `json:"request_id"`
	Meta       any                 `json:"meta"`
}

// streamAgentRequest sends the same request shape the renderer uses, then
// prints each streamed delta as soon as core emits it. The terminal should feel
// like a real editor surface, so we do not wait for the full model response
// before showing output.
func streamAgentRequest(ctx context.Context, input streamRequestInput) (string, error) {
	streamCtx, cancelStream := context.WithCancel(ctx)
	interruptState := startStreamInterrupt(cancelStream)
	defer interruptState.Stop()
	defer cancelStream()
	cursorState := hideTerminalCursorDuringStream()
	defer cursorState.Restore()

	port := resolveCorePort()
	if err := ensureCore(streamCtx, port); err != nil {
		return "", err
	}

	folderPath := strings.TrimSpace(input.FolderPath)
	if folderPath == "" {
		var err error
		folderPath, err = os.Getwd()
		if err != nil {
			return "", err
		}
	}

	request := ai.ChatRequest{
		Action:       input.Action,
		Prompt:       input.Prompt,
		FolderPath:   &folderPath,
		Diagnostics:  input.Diagnostics,
		GitDiff:      input.GitDiff,
		Conversation: input.Conversation,
		Model:        defaultModelID(),
	}

	if toolContext := buildCliToolContext(streamCtx, streamRequestInput{
		Action:       input.Action,
		Prompt:       input.Prompt,
		FolderPath:   folderPath,
		Diagnostics:  input.Diagnostics,
		GitDiff:      input.GitDiff,
		Conversation: input.Conversation,
	}); strings.TrimSpace(toolContext) != "" {
		request.Conversation = append(request.Conversation, ai.ConversationMessage{
			Role:    "user",
			Content: toolContext,
		})
	}

	if shouldFetchProjectContext(input) {
		// Project context is best-effort here because the useful behavior is
		// still to answer from the current workspace path and backend tools if a
		// context pack cannot be built. We only attach it for project-shaped
		// requests; sending a huge workspace pack for `axon ask hi` makes the
		// model appear frozen even though the stream transport is healthy.
		if contextPack, err := fetchProjectContext(streamCtx, port, folderPath); err == nil {
			request.ProjectContext = &contextPack
		} else {
			fmt.Fprintln(os.Stderr, dim("Project context unavailable; continuing with workspace path only."))
		}
	}

	rawPayload, err := json.Marshal(request)
	if err != nil {
		return "", err
	}

	httpRequest, err := http.NewRequestWithContext(streamCtx, http.MethodPost, coreURL(port, "/ai/chat/stream"), bytes.NewReader(rawPayload))
	if err != nil {
		return "", err
	}
	httpRequest.Header.Set("Content-Type", "application/json")

	spinner := startStreamSpinner("Axon is thinking")
	defer spinner.Stop()

	response, err := http.DefaultClient.Do(httpRequest)
	if err != nil {
		if interruptState.Interrupted() {
			return "", errStreamInterrupted
		}
		return "", err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		spinner.Stop()
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return "", fmt.Errorf("Axon Agent request failed: %s", strings.TrimSpace(string(body)))
	}

	var fullResponse strings.Builder
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		// The stream uses Axon's normal response envelope on every NDJSON line.
		// That keeps CLI behavior aligned with the renderer contract: errors are
		// top-level envelope errors, while successful lines carry ai.StreamEvent
		// payloads inside data.
		var envelope streamEnvelope
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			spinner.Stop()
			return fullResponse.String(), err
		}
		if envelope.Status == "error" {
			spinner.Stop()
			return fullResponse.String(), fmt.Errorf("%s", envelope.Message)
		}
		var event ai.StreamEvent
		if err := json.Unmarshal(envelope.Data, &event); err != nil {
			spinner.Stop()
			return fullResponse.String(), err
		}
		if event.Type == "status" && event.Status != "" {
			spinner.Update(streamStatusLabel(event.Status))
			continue
		}
		if event.Type == "delta" && event.Delta != "" {
			spinner.Stop()
			fmt.Print(white(event.Delta))
			fullResponse.WriteString(event.Delta)
		}
		if event.Type == "done" || event.Done {
			spinner.Stop()
			fmt.Println()
			return strings.TrimSpace(fullResponse.String()), nil
		}
	}
	if err := scanner.Err(); err != nil {
		spinner.Stop()
		if interruptState.Interrupted() {
			return fullResponse.String(), errStreamInterrupted
		}
		return fullResponse.String(), err
	}
	spinner.Stop()
	fmt.Println()
	return strings.TrimSpace(fullResponse.String()), nil
}

// defaultModelID chooses the faster local coding model for terminal commands.
// The environment override is intentionally kept for development and debugging
// without exposing raw runtime model names in normal CLI usage.
func defaultModelID() string {
	return selectedModelID()
}

func shouldFetchProjectContext(input streamRequestInput) bool {
	if input.Action != "ask" {
		return true
	}
	if promptNeedsProjectContext(input.Prompt) {
		return true
	}

	// Follow-up prompts are often short: "yes", "where?", "can you see it?".
	// Looking only at the current text drops project context exactly when the
	// conversation needs continuity, so we inspect recent user turns before
	// deciding that a small prompt is just casual chat.
	for index := len(input.Conversation) - 1; index >= 0 && index >= len(input.Conversation)-6; index-- {
		message := input.Conversation[index]
		if message.Role == "user" && promptNeedsProjectContext(message.Content) {
			return true
		}
	}
	return false
}

func promptNeedsProjectContext(prompt string) bool {
	normalizedPrompt := strings.ToLower(strings.TrimSpace(prompt))
	if normalizedPrompt == "" {
		return false
	}
	greetings := map[string]bool{
		"hi": true, "hey": true, "hello": true, "yo": true,
		"hi axon": true, "hey axon": true, "hello axon": true,
	}
	if greetings[normalizedPrompt] {
		return false
	}

	projectTerms := []string{
		"file", "folder", "project", "workspace", "repo", "code", "codebase", "code base", "function",
		"method", "class", "component", "where", "find", "search", "read",
		"implement", "fix", "bug", "error", "diagnostic", "git", "diff", "see my",
	}
	for _, term := range projectTerms {
		if strings.Contains(normalizedPrompt, term) {
			return true
		}
	}
	return len(strings.Fields(normalizedPrompt)) > 6
}

type streamSpinner struct {
	output io.Writer
	done   chan struct{}
	once   sync.Once
	mu     sync.Mutex
	label  string
	active bool
	width  int
}

func startStreamSpinner(label string) *streamSpinner {
	spinner := &streamSpinner{
		output: os.Stderr,
		done:   make(chan struct{}),
		label:  label,
		active: isTerminalOutput(os.Stderr),
		width:  terminalStatusWidth(),
	}
	if !spinner.active {
		return spinner
	}

	// The model stream already sends internal status events such as runtime
	// checks and transport setup. Those are useful for logs but noisy for a
	// serious terminal UI, so the CLI collapses them into one live progress line
	// that disappears before the first assistant token is printed.
	go spinner.run()
	return spinner
}

func (spinner *streamSpinner) Update(label string) {
	if !spinner.active || strings.TrimSpace(label) == "" {
		return
	}
	spinner.mu.Lock()
	spinner.label = label
	spinner.mu.Unlock()
}

func (spinner *streamSpinner) Stop() {
	spinner.once.Do(func() {
		close(spinner.done)
		if spinner.active {
			fmt.Fprint(spinner.output, "\r\x1b[2K")
		}
	})
}

func (spinner *streamSpinner) run() {
	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	delay := time.NewTimer(260 * time.Millisecond)
	defer delay.Stop()

	select {
	case <-spinner.done:
		return
	case <-delay.C:
	}

	ticker := time.NewTicker(90 * time.Millisecond)
	defer ticker.Stop()

	index := 0
	for {
		select {
		case <-spinner.done:
			return
		case <-ticker.C:
			spinner.mu.Lock()
			label := spinner.label
			spinner.mu.Unlock()
			fmt.Fprintf(
				spinner.output,
				"\r\x1b[2K%s %s",
				// This frame set is Axon's loading mark. It stays separate from
				// the prompt cursor: the prompt owns input focus, and this animated
				// mark only appears on the transient status line that gets cleared
				// before model output is printed.
				accent(frames[index%len(frames)]),
				shimmerStatusText(label, spinner.width, index),
			)
			index++
		}
	}
}

func shimmerStatusText(label string, width int, frame int) string {
	trimmed := strings.TrimSpace(label)
	if trimmed == "" {
		trimmed = "Axon is thinking"
	}
	if width < 18 {
		width = 18
	}
	if width > 42 {
		width = 42
	}

	runes := []rune(trimmed)
	if len(runes) > width {
		runes = runes[:width]
	}

	// The moving bright segment is the terminal version of the Codex-style
	// thinking shimmer: the text stays in one place, while a small white window
	// sweeps across it to signal active work without printing internal backend
	// milestones into the transcript.
	position := frame % (len(runes) + 4)
	var builder strings.Builder
	for index, r := range runes {
		if index >= position-1 && index <= position+1 {
			builder.WriteString(white(string(r)))
			continue
		}
		builder.WriteString(dim(string(r)))
	}
	return builder.String()
}

func streamStatusLabel(status string) string {
	normalized := strings.ToLower(strings.TrimSpace(status))
	switch {
	case strings.Contains(normalized, "project") || strings.Contains(normalized, "context"):
		return "Reading workspace"
	case strings.Contains(normalized, "stream"):
		return "Preparing response"
	case strings.Contains(normalized, "runtime") || strings.Contains(normalized, "model"):
		return "Preparing local model"
	default:
		return "Axon is thinking"
	}
}

func isTerminalOutput(file *os.File) bool {
	info, err := file.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

func terminalStatusWidth() int {
	width := terminalPromptWidth()
	if width <= 0 {
		return 36
	}
	return width - 6
}
