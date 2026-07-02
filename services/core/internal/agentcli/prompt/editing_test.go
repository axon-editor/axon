package prompt

import "testing"

func TestPromptHistoryFromConversationDropsEmptyAndAdjacentDuplicates(t *testing.T) {
	got := HistoryFromConversation([]string{"", "first", "first", "second"})
	if len(got) != 2 || got[0] != "first" || got[1] != "second" {
		t.Fatalf("HistoryFromConversation = %#v, want first and second", got)
	}
}

func TestMovePromptCursorVerticallyKeepsColumnAcrossLines(t *testing.T) {
	buffer := []rune("one\ntwo longer\ntri")
	cursor := len([]rune("one\ntwo"))

	up := MoveCursorVertically(buffer, cursor, -1)
	if up != len([]rune("one")) {
		t.Fatalf("up cursor = %d, want column three on first line", up)
	}

	down := MoveCursorVertically(buffer, cursor, 1)
	if down != len([]rune("one\ntwo longer\ntri")) {
		t.Fatalf("down cursor = %d, want column three on third line", down)
	}
}
