package agentcli

// promptHistoryFromConversation keeps the terminal composer useful after a
// resume. It only lifts user turns because assistant/model output should never
// appear when the user presses the history arrow.
func promptHistoryFromConversation(messages []string) []string {
	history := make([]string, 0, len(messages))
	for _, message := range messages {
		if message == "" {
			continue
		}
		if len(history) > 0 && history[len(history)-1] == message {
			continue
		}
		history = append(history, message)
	}
	return history
}

// movePromptCursorVertically gives multiline input the same basic editing
// contract as a real composer: Up and Down move between visual text lines when
// the buffer contains newlines, and the session history only takes over for a
// single-line prompt.
func movePromptCursorVertically(buffer []rune, cursor int, direction int) int {
	if len(buffer) == 0 || direction == 0 {
		return cursor
	}
	lineStart, lineEnd := promptLineBounds(buffer, cursor)
	column := cursor - lineStart
	if direction < 0 {
		if lineStart == 0 {
			return cursor
		}
		previousStart, previousEnd := promptLineBounds(buffer, lineStart-1)
		if previousStart+column > previousEnd {
			return previousEnd
		}
		return previousStart + column
	}
	if lineEnd >= len(buffer) {
		return cursor
	}
	nextStart, nextEnd := promptLineBounds(buffer, lineEnd+1)
	if nextStart+column > nextEnd {
		return nextEnd
	}
	return nextStart + column
}

func promptLineBounds(buffer []rune, cursor int) (int, int) {
	if cursor < 0 {
		cursor = 0
	}
	if cursor > len(buffer) {
		cursor = len(buffer)
	}

	start := cursor
	for start > 0 && buffer[start-1] != '\n' {
		start--
	}

	end := cursor
	for end < len(buffer) && buffer[end] != '\n' {
		end++
	}
	return start, end
}

func promptHasMultipleLines(buffer []rune) bool {
	for _, char := range buffer {
		if char == '\n' {
			return true
		}
	}
	return false
}
