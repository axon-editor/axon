import { type AxonSettings, normalizeSettings } from "../../../../shared/settings";

const MIN_EDITOR_FONT_SIZE = 10;
const MAX_EDITOR_FONT_SIZE = 28;

function clampEditorFontSize(size: number) {
  return Math.max(MIN_EDITOR_FONT_SIZE, Math.min(MAX_EDITOR_FONT_SIZE, size));
}

function editorFontZoomDirection(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return 0;

  // `+` is Shift+= on many keyboard layouts, but browsers can report either
  // the produced character or the underlying equals key. Supporting both keeps
  // Cmd/Ctrl+Plus natural while still making Cmd/Ctrl+Minus symmetrical.
  if (event.key === "+" || event.key === "=") return 1;
  if (event.key === "-" || event.key === "_") return -1;
  return 0;
}

export function settingsFromEditorFontZoomShortcut(
  event: KeyboardEvent,
  settings: AxonSettings,
) {
  const direction = editorFontZoomDirection(event);
  if (direction === 0) return null;

  const nextFontSize = clampEditorFontSize(settings.editor.fontSize + direction);
  if (nextFontSize === settings.editor.fontSize) return null;
  const lineHeightRatio = settings.editor.lineHeight / settings.editor.fontSize;
  const nextLineHeight = Math.round(nextFontSize * lineHeightRatio);

  // Font zoom is persisted through normal editor settings instead of being a
  // transient Monaco option. That makes the shortcut affect every pane, the
  // integrated terminal sizing that follows editor font size, and the next app
  // launch without adding another separate zoom state to keep in sync.
  return normalizeSettings({
    ...settings,
    editor: {
      ...settings.editor,
      fontSize: nextFontSize,
      lineHeight: nextLineHeight,
    },
  });
}
