// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package client

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
)

// ScanEvents parses OpenCode's SSE frames. Heartbeats and malformed frames are
// dropped so one bad payload cannot end a healthy run.
func ScanEvents(body io.Reader, emit func(Event) error) error {
	reader := bufio.NewReaderSize(body, 64*1024)
	data := make([]string, 0, 4)
	for {
		line, err := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if line == "" && len(data) > 0 {
			if event, ok := parseFrame(strings.Join(data, "\n")); ok {
				if emitErr := emit(event); emitErr != nil {
					return emitErr
				}
			}
			data = data[:0]
		} else if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
		if err != nil {
			if len(data) > 0 {
				if event, ok := parseFrame(strings.Join(data, "\n")); ok {
					_ = emit(event)
				}
			}
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

func parseFrame(payload string) (Event, bool) {
	if strings.TrimSpace(payload) == "" {
		return Event{}, false
	}
	var event Event
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return Event{}, false
	}
	if event.Type == "" {
		return Event{}, false
	}
	return event, true
}
