package agentcli

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/GordenArcher/axon-core/internal/agentcli/prompt"
	"github.com/GordenArcher/axon-core/internal/agentcli/terminalui"
	"github.com/GordenArcher/axon-core/internal/ai"
)

type agentSessionRecord struct {
	ID           string                   `json:"id"`
	Workspace    string                   `json:"workspace"`
	Title        string                   `json:"title"`
	CreatedAt    string                   `json:"createdAt"`
	UpdatedAt    string                   `json:"updatedAt"`
	Conversation []ai.ConversationMessage `json:"conversation"`
}

type agentSessionStore struct {
	Sessions []agentSessionRecord `json:"sessions"`
}

func sessionStorePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".axon", "agent-sessions.json"), nil
}

func loadAgentSessionStore() (agentSessionStore, error) {
	path, err := sessionStorePath()
	if err != nil {
		return agentSessionStore{}, err
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return agentSessionStore{}, nil
		}
		return agentSessionStore{}, err
	}

	var store agentSessionStore
	if err := json.Unmarshal(raw, &store); err != nil {
		return agentSessionStore{}, err
	}
	if store.Sessions == nil {
		store.Sessions = []agentSessionRecord{}
	}
	return store, nil
}

func saveAgentSessionStore(store agentSessionStore) error {
	path, err := sessionStorePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func normalizeWorkspacePath(folderPath string) (string, error) {
	absolute, err := filepath.Abs(folderPath)
	if err != nil {
		return "", err
	}
	return filepath.Clean(absolute), nil
}

func newSessionID() string {
	return fmt.Sprintf("%d-%s", time.Now().UnixMilli(), randomSuffix())
}

func randomSuffix() string {
	buffer := make([]byte, 4)
	if _, err := rand.Read(buffer); err != nil {
		return strings.TrimLeft(fmt.Sprintf("%x", time.Now().UnixNano()), "0")
	}
	return hex.EncodeToString(buffer)
}

func sessionTitle(messages []ai.ConversationMessage) string {
	for _, message := range messages {
		if message.Role != "user" {
			continue
		}
		trimmed := strings.TrimSpace(message.Content)
		if trimmed == "" {
			continue
		}
		// Session titles are shown in terminal lists, so truncation has to be
		// rune-aware. Slicing the Go string directly can split a multi-byte
		// character and leave replacement glyphs in the session picker.
		runes := []rune(trimmed)
		if len(runes) > 60 {
			return string(runes[:57]) + "..."
		}
		return trimmed
	}
	return "New conversation"
}

func withAgentSessionStoreLock(fn func() error) error {
	// The session store is a shared JSON file that can be updated by multiple
	// `axon ask` or `axon resume` processes at the same time. I take a small
	// companion lock before the read-modify-write cycle so one process cannot
	// read stale JSON and overwrite a session record another process just saved.
	path, err := sessionStorePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	lockPath := path + ".lock"
	deadline := time.Now().Add(5 * time.Second)
	for {
		file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err == nil {
			// The pid is only diagnostic. The atomic create is the lock; writing
			// the pid makes a stale lock easier to inspect if a CLI process is
			// killed between acquisition and cleanup.
			_, _ = fmt.Fprintf(file, "%d\n", os.Getpid())
			_ = file.Close()
			defer os.Remove(lockPath)
			return fn()
		}
		if !os.IsExist(err) {
			return err
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for agent session store lock")
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func saveSessionRecord(record agentSessionRecord) error {
	return withAgentSessionStoreLock(func() error {
		store, err := loadAgentSessionStore()
		if err != nil {
			return err
		}

		updated := false
		for index := range store.Sessions {
			if store.Sessions[index].ID == record.ID && store.Sessions[index].Workspace == record.Workspace {
				store.Sessions[index] = record
				updated = true
				break
			}
		}
		if !updated {
			store.Sessions = append(store.Sessions, record)
		}
		sort.SliceStable(store.Sessions, func(left, right int) bool {
			leftTime, _ := time.Parse(time.RFC3339, store.Sessions[left].UpdatedAt)
			rightTime, _ := time.Parse(time.RFC3339, store.Sessions[right].UpdatedAt)
			return leftTime.After(rightTime)
		})
		if len(store.Sessions) > 100 {
			store.Sessions = store.Sessions[:100]
		}
		return saveAgentSessionStore(store)
	})
}

func workspaceSessions(workspace string) ([]agentSessionRecord, error) {
	store, err := loadAgentSessionStore()
	if err != nil {
		return nil, err
	}
	sessions := make([]agentSessionRecord, 0, len(store.Sessions))
	for _, session := range store.Sessions {
		if session.Workspace == workspace {
			sessions = append(sessions, session)
		}
	}
	sort.SliceStable(sessions, func(left, right int) bool {
		leftTime, _ := time.Parse(time.RFC3339, sessions[left].UpdatedAt)
		rightTime, _ := time.Parse(time.RFC3339, sessions[right].UpdatedAt)
		return leftTime.After(rightTime)
	})
	return sessions, nil
}

func findWorkspaceSession(workspace, sessionID string) (*agentSessionRecord, error) {
	sessions, err := workspaceSessions(workspace)
	if err != nil {
		return nil, err
	}
	for index := range sessions {
		if sessions[index].ID == sessionID {
			return &sessions[index], nil
		}
	}
	return nil, nil
}

type agentTerminalSession struct {
	workspace    string
	id           string
	title        string
	createdAt    time.Time
	updatedAt    time.Time
	conversation []ai.ConversationMessage
}

func newAgentTerminalSession(workspace string, conversation []ai.ConversationMessage, id string) agentTerminalSession {
	now := time.Now().UTC()
	sessionID := id
	if sessionID == "" {
		sessionID = newSessionID()
	}
	return agentTerminalSession{
		workspace:    workspace,
		id:           sessionID,
		title:        sessionTitle(conversation),
		createdAt:    now,
		updatedAt:    now,
		conversation: append([]ai.ConversationMessage(nil), conversation...),
	}
}

func (session *agentTerminalSession) record() agentSessionRecord {
	return agentSessionRecord{
		ID:           session.id,
		Workspace:    session.workspace,
		Title:        session.title,
		CreatedAt:    session.createdAt.Format(time.RFC3339),
		UpdatedAt:    session.updatedAt.Format(time.RFC3339),
		Conversation: append([]ai.ConversationMessage(nil), session.conversation...),
	}
}

func (session *agentTerminalSession) touch() {
	session.updatedAt = time.Now().UTC()
	session.title = sessionTitle(session.conversation)
}

func (session *agentTerminalSession) save() {
	_ = saveSessionRecord(session.record())
}

func (session *agentTerminalSession) appendUserTurn(prompt string) {
	session.conversation = append(session.conversation, ai.ConversationMessage{
		Role:    "user",
		Content: prompt,
	})
	session.touch()
	session.save()
}

func (session *agentTerminalSession) appendAssistantTurn(content string) {
	session.conversation = append(session.conversation, ai.ConversationMessage{
		Role:    "assistant",
		Content: content,
	})
	session.touch()
	session.save()
}

func printSessionList(workspace string) int {
	sessions, err := workspaceSessions(workspace)
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	fmt.Println("Axon sessions")
	fmt.Println(dim("Workspace: " + workspace))
	if len(sessions) == 0 {
		fmt.Println(dim("No saved sessions yet. Start Axon and ask something to create one."))
		return 0
	}

	for _, session := range sessions {
		updatedAt, _ := time.Parse(time.RFC3339, session.UpdatedAt)
		count := len(session.Conversation)
		fmt.Printf(
			"%s  %s  %s  %s\n",
			session.ID,
			sessionTitle(session.Conversation),
			updatedAt.Format("2006-01-02 15:04"),
			messageCountLabel(count),
		)
	}

	fmt.Println(dim("Use `axon resume :id` to reopen one of these sessions."))
	return 0
}

func messageCountLabel(count int) string {
	if count == 1 {
		return "1 turn"
	}
	return fmt.Sprintf("%d turns", count)
}

func agentStreamTimeout() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("AXON_STREAM_TIMEOUT")); raw != "" {
		if duration, err := time.ParseDuration(raw); err == nil && duration > 0 {
			return duration
		}
	}
	return 30 * time.Minute
}

func runTerminalSession(workspace string, session *agentTerminalSession) int {
	currentSession := session
	if currentSession == nil {
		fresh := newAgentTerminalSession(workspace, nil, "")
		currentSession = &fresh
	}

	printTerminalSessionHeader(workspace, currentSession)
	promptHistory := userPromptHistory(currentSession.conversation)

	for {
		// A dedicated prompt renderer is used instead of plain bufio line input
		// because the Axon CLI behaves like a small command surface, not generic
		// stdin. Raw key handling lets slash commands filter live while typing.
		prompt, err := readAgentPrompt(promptHistory)
		if err != nil {
			if err == io.EOF {
				fmt.Println()
				return 0
			}
			fmt.Fprintln(os.Stderr, red(err.Error()))
			continue
		}
		if prompt == "" {
			continue
		}
		switch strings.ToLower(prompt) {
		case "/exit", "/quit", "exit", "quit":
			return 0
		}

		if handled, exitCode := runSlashCommand(prompt); handled {
			if exitCode != 0 {
				fmt.Fprintln(os.Stderr, dim("Local command failed; the session stays open."))
			}
			continue
		}

		history := append([]ai.ConversationMessage(nil), currentSession.conversation...)
		currentSession.appendUserTurn(prompt)
		promptHistory = appendPromptHistory(promptHistory, prompt)

		ctx, cancel := context.WithTimeout(context.Background(), agentStreamTimeout())
		response, err := streamAgentRequest(ctx, streamRequestInput{
			Action:       "ask",
			Prompt:       prompt,
			FolderPath:   workspace,
			Conversation: history,
		})
		cancel()
		if err != nil {
			if errors.Is(err, errStreamInterrupted) {
				fmt.Fprintln(os.Stderr, red("Axon stream interrupted."))
				continue
			}
			fmt.Fprintln(os.Stderr, red(err.Error()))
			continue
		}

		currentSession.appendAssistantTurn(response)
	}
}

func userPromptHistory(conversation []ai.ConversationMessage) []string {
	prompts := make([]string, 0, len(conversation))
	for _, message := range conversation {
		if message.Role == "user" {
			prompts = append(prompts, message.Content)
		}
	}
	return prompt.HistoryFromConversation(prompts)
}

func appendPromptHistory(history []string, prompt string) []string {
	trimmed := strings.TrimSpace(prompt)
	if trimmed == "" {
		return history
	}
	if len(history) > 0 && history[len(history)-1] == trimmed {
		return history
	}
	return append(history, trimmed)
}

func runOneShotSession(workspace, prompt string) int {
	session := newAgentTerminalSession(workspace, nil, "")
	history := append([]ai.ConversationMessage(nil), session.conversation...)
	session.appendUserTurn(prompt)
	terminalui.PrintChatRole(os.Stdout, "You")
	fmt.Println(prompt)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	response, err := streamAgentRequest(ctx, streamRequestInput{
		Action:       "ask",
		Prompt:       prompt,
		FolderPath:   workspace,
		Conversation: history,
	})
	if err != nil {
		if errors.Is(err, errStreamInterrupted) {
			fmt.Fprintln(os.Stderr, red("Axon stream interrupted."))
			return 1
		}
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	session.appendAssistantTurn(response)
	return 0
}
