package agentcli

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// runCommit turns the staged Git diff into a commit message draft.
// It deliberately stops before mutating history and asks for confirmation,
// because the model can help write the message but the user should still own
// the final commit action in the terminal.
func runCommit(args []string) int {
	if len(args) > 0 {
		fmt.Fprintln(os.Stderr, red("Usage: axon commit"))
		return 1
	}

	// Commit drafting is intentionally based on the staged diff only. That
	// matches how Git actually commits and prevents unstaged local experiments
	// from leaking into a message the user may run immediately.
	diff, err := stagedDiff()
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}
	if strings.TrimSpace(diff) == "" {
		fmt.Fprintln(os.Stderr, dim("No staged changes found. Stage files before asking Axon Agent for a commit message."))
		return 1
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	message, err := streamAgentRequest(ctx, streamRequestInput{
		Action:  "draft-commit-message",
		Prompt:  "Draft a concise production commit message for the staged diff.",
		GitDiff: diff,
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, red(err.Error()))
		return 1
	}

	commitMessage := cleanCommitMessage(message)
	if commitMessage == "" {
		fmt.Fprintln(os.Stderr, red("Axon Agent did not return a usable commit message."))
		return 1
	}

	// The CLI streams the draft first, then asks before executing git commit.
	// This keeps terminal usage fast while still making the destructive step
	// explicit enough that a bad model response cannot silently create history.
	fmt.Print(dim("Run git commit with this message? [y/N] "))
	answer, _ := bufio.NewReader(os.Stdin).ReadString('\n')
	if strings.EqualFold(strings.TrimSpace(answer), "y") || strings.EqualFold(strings.TrimSpace(answer), "yes") {
		command := exec.Command("git", "commit", "-m", commitMessage)
		command.Stdout = os.Stdout
		command.Stderr = os.Stderr
		if err := command.Run(); err != nil {
			fmt.Fprintln(os.Stderr, red(err.Error()))
			return 1
		}
	}
	return 0
}

func stagedDiff() (string, error) {
	// `git diff --staged` is the source of truth for commit drafting because it
	// mirrors exactly what Git will commit. Reading the working tree diff here
	// would produce impressive-looking messages that can be wrong the moment the
	// user has unstaged experiments in the same repo.
	command := exec.Command("git", "diff", "--staged")
	output, err := command.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}

// cleanCommitMessage strips the most common fence wrapper from model output.
// The model is prompted to return a commit message, but local models sometimes
// wrap plain text in markdown fences; passing those fences directly to
// `git commit -m` would create noisy commit subjects.
func cleanCommitMessage(message string) string {
	trimmed := strings.TrimSpace(message)
	if strings.HasPrefix(trimmed, "```") {
		lines := strings.Split(trimmed, "\n")
		if len(lines) > 1 {
			lines = lines[1:]
			if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "```" {
				lines = lines[:len(lines)-1]
			}
			trimmed = strings.Join(lines, "\n")
		}
	}
	trimmed = strings.TrimSpace(trimmed)
	return trimmed
}
