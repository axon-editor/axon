package server

import (
	"encoding/json"
	"net/http"

	"github.com/GordenArcher/axon-core/internal/ai"
	"github.com/google/uuid"
)

func newStreamRequestID() string {
	return uuid.New().String()
}

type aiEnvelope struct {
	Status     string              `json:"status"`
	HTTPStatus int                 `json:"http_status"`
	Message    string              `json:"message"`
	Data       any                 `json:"data"`
	Errors     map[string][]string `json:"errors"`
	Code       any                 `json:"code"`
	RequestID  string              `json:"request_id"`
	Meta       any                 `json:"meta"`
}

func writeAIJSON(w http.ResponseWriter, httpStatus int, envelope aiEnvelope) {
	envelope.HTTPStatus = httpStatus
	if envelope.RequestID == "" {
		envelope.RequestID = newStreamRequestID()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpStatus)
	_ = json.NewEncoder(w).Encode(envelope)
}

func aiSuccessEnvelope(requestID string, httpStatus int, message string, data any) aiEnvelope {
	return aiEnvelope{
		Status:     "success",
		HTTPStatus: httpStatus,
		Message:    message,
		Data:       data,
		Errors:     nil,
		Code:       nil,
		RequestID:  requestID,
		Meta:       nil,
	}
}

func aiErrorEnvelope(requestID string, httpStatus int, detail ai.ErrorDetail) aiEnvelope {
	errors := map[string][]string{}
	if detail.Field != "" && detail.Code != "" {
		errors[detail.Field] = []string{lowerSnake(detail.Code)}
	}
	if len(errors) == 0 {
		errors = nil
	}

	return aiEnvelope{
		Status:     "error",
		HTTPStatus: httpStatus,
		Message:    detail.Message,
		Data:       nil,
		Errors:     errors,
		Code:       detail.Code,
		RequestID:  requestID,
		Meta:       nil,
	}
}

func writeStreamEnvelope(
	w http.ResponseWriter,
	requestID string,
	httpStatus int,
	message string,
	data any,
) error {
	rawEvent, err := json.Marshal(aiSuccessEnvelope(requestID, httpStatus, message, data))
	if err != nil {
		return err
	}
	if _, err := w.Write(append(rawEvent, '\n')); err != nil {
		return err
	}
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
	return nil
}

func writeStreamErrorEnvelope(
	w http.ResponseWriter,
	requestID string,
	httpStatus int,
	detail ai.ErrorDetail,
) error {
	rawEvent, err := json.Marshal(aiErrorEnvelope(requestID, httpStatus, detail))
	if err != nil {
		return err
	}
	if _, err := w.Write(append(rawEvent, '\n')); err != nil {
		return err
	}
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
	return nil
}

func lowerSnake(value string) string {
	output := make([]rune, 0, len(value))
	for _, char := range value {
		if char >= 'A' && char <= 'Z' {
			output = append(output, char+'a'-'A')
			continue
		}
		output = append(output, char)
	}
	return string(output)
}
