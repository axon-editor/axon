package agentcli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type editProposalDocument struct {
	EditProposal editProposal `json:"editProposal"`
}

type editProposal struct {
	Title string             `json:"title"`
	Files []editProposalFile `json:"files"`
}

type editProposalFile struct {
	Path       string `json:"path"`
	Summary    string `json:"summary"`
	NewContent string `json:"newContent"`
}

// extractEditProposal accepts the full streamed assistant response because the
// model can include explanation text before or after the JSON block. The CLI
// only applies edits when it can find the exact editProposal shape Axon already
// uses in the sidebar, which keeps terminal fixes on the same review contract.
func extractEditProposal(response string) (editProposal, error) {
	rawJSON, ok := extractEditProposalJSON(response)
	if !ok {
		return editProposal{}, fmt.Errorf("Axon Agent did not return an edit proposal")
	}

	var document editProposalDocument
	if err := json.Unmarshal([]byte(rawJSON), &document); err != nil {
		return editProposal{}, err
	}
	if len(document.EditProposal.Files) == 0 {
		return editProposal{}, fmt.Errorf("edit proposal did not include any files")
	}
	return document.EditProposal, nil
}

// extractEditProposalJSON uses balanced braces instead of a lazy regex. Edit
// proposals can contain nested file objects and full source text, so regex
// stripping breaks as soon as a file contains a brace-heavy language block.
func extractEditProposalJSON(response string) (string, bool) {
	proposalIndex := strings.Index(response, "\"editProposal\"")
	if proposalIndex == -1 {
		return "", false
	}

	start := strings.LastIndex(response[:proposalIndex], "{")
	if start == -1 {
		return "", false
	}

	depth := 0
	inString := false
	escaped := false
	for index := start; index < len(response); index++ {
		character := response[index]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if character == '\\' {
				escaped = true
				continue
			}
			if character == '"' {
				inString = false
			}
			continue
		}
		if character == '"' {
			inString = true
			continue
		}
		if character == '{' {
			depth++
			continue
		}
		if character == '}' {
			depth--
			if depth == 0 {
				return response[start : index+1], true
			}
		}
	}

	return "", false
}

// applyEditProposal writes full replacement file content to disk. The agent is
// allowed to propose multiple files, but every path is resolved through
// resolveProposalPath first so hallucinated absolute paths cannot escape the
// workspace that produced the diagnostics.
func applyEditProposal(workspace string, proposal editProposal) error {
	for _, file := range proposal.Files {
		targetPath, err := resolveProposalPath(workspace, file.Path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(targetPath, []byte(file.NewContent), 0644); err != nil {
			return err
		}
		fmt.Fprintf(os.Stderr, "%s\n", dim("Applied "+file.Path))
	}
	return nil
}

// resolveProposalPath normalizes both workspace-relative and absolute proposal
// paths into a single absolute path under the active workspace. This is the
// final safety gate before `axon fix` writes anything to disk.
func resolveProposalPath(workspace string, proposalPath string) (string, error) {
	cleanWorkspace, err := filepath.Abs(workspace)
	if err != nil {
		return "", err
	}

	candidatePath := proposalPath
	if !filepath.IsAbs(candidatePath) {
		candidatePath = filepath.Join(cleanWorkspace, candidatePath)
	}
	candidatePath, err = filepath.Abs(candidatePath)
	if err != nil {
		return "", err
	}

	relativePath, err := filepath.Rel(cleanWorkspace, candidatePath)
	if err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("edit proposal tried to write outside the workspace: %s", proposalPath)
	}
	return candidatePath, nil
}
