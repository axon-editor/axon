package agentcli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/GordenArcher/axon-core/internal/ai"
)

// projectContextEnvelope mirrors axon-core's response envelope for the
// /ai/project-context endpoint. The CLI only needs the data and message fields,
// but keeping the envelope shape explicit makes it clear that this is the same
// backend contract the renderer already consumes.
type projectContextEnvelope struct {
	Status  string              `json:"status"`
	Data    ai.ProjectContext   `json:"data"`
	Errors  map[string][]string `json:"errors"`
	Message string              `json:"message"`
}

// fetchProjectContext asks axon-core for the same trimmed workspace snapshot
// the sidebar uses. Keeping context collection in core matters because the CLI
// should not grow its own file crawler, ignore rules, or token budget behavior
// that slowly drifts away from the editor.
func fetchProjectContext(ctx context.Context, port string, folderPath string) (ai.ProjectContext, error) {
	endpoint := coreURL(port, "/ai/project-context") + "?root=" + url.QueryEscape(folderPath)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ai.ProjectContext{}, err
	}
	authorizeCoreRequest(request)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return ai.ProjectContext{}, err
	}
	defer response.Body.Close()

	var envelope projectContextEnvelope
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		return ai.ProjectContext{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || envelope.Status == "error" {
		return ai.ProjectContext{}, fmt.Errorf("%s", envelope.Message)
	}
	return envelope.Data, nil
}
