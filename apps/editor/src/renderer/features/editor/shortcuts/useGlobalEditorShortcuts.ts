import { useEffect } from "react";
import { AXON_COMMANDS, type AxonCommand } from "../../../../shared/commands";
import { type AxonSettings } from "../../../../shared/settings";
import { settingsFromEditorFontZoomShortcut } from "./fontZoom";

interface GlobalEditorShortcutsOptions {
  settings: AxonSettings;
  zenMode: boolean;
  runCommand: (command: AxonCommand) => void;
  onSaveSettings: (
    settings: AxonSettings,
    options?: { announce?: boolean },
  ) => void | Promise<void>;
  onSetZenMode: (enabled: boolean) => void;
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".monaco-editor")) return false;

  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']",
    ),
  );
}

function getEditorShortcutPath(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return undefined;
  return target.closest<HTMLElement>("[data-axon-editor-path]")?.dataset
    .axonEditorPath;
}

export function useGlobalEditorShortcuts({
  settings,
  zenMode,
  runCommand,
  onSaveSettings,
  onSetZenMode,
}: GlobalEditorShortcutsOptions) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const nextFontSettings = settingsFromEditorFontZoomShortcut(
        event,
        settings,
      );
      if (nextFontSettings) {
        event.preventDefault();
        void onSaveSettings(nextFontSettings, { announce: false });
        return;
      }

      if (event.key === "F12" && !event.shiftKey) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.GO_TO_DEFINITION);
        return;
      }
      if (event.key === "F12" && event.shiftKey) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.FIND_REFERENCES);
        return;
      }
      if (event.key === "F8" && !event.shiftKey) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.NEXT_PROBLEM);
        return;
      }
      if (event.key === "F8" && event.shiftKey) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.PREVIOUS_PROBLEM);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "p") {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_COMMAND_PALETTE);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        if (isEditableShortcutTarget(event.target)) return;

        // Cmd/Ctrl+F should open Axon's editor find from the editor surface and
        // other non-text chrome, but it should not steal the shortcut from an
        // already-focused input such as the find box, command palette, settings
        // search, or any text field. The Monaco editor is the exception because
        // its hidden textarea is implementation detail; there we route to the
        // visible editor's find widget deliberately.
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("axon:openFind", {
            detail: { path: getEditorShortcutPath(event.target) },
          }),
        );
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.SAVE);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_WORKSPACE_SEARCH);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "j") {
        event.preventDefault();
        runCommand(AXON_COMMANDS.TOGGLE_TERMINAL);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.TOGGLE_SIDEBAR);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_FILE_OUTLINE);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_DIFF_VIEW);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SOURCE_CONTROL);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key === ",") {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SETTINGS);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        (event.key === "," || event.key === "<")
      ) {
        event.preventDefault();
        runCommand(AXON_COMMANDS.OPEN_SETTINGS_JSON);
        return;
      }
      if (event.key === "Escape" && zenMode) {
        onSetZenMode(false);
      }
    };

    // Capture phase gives Axon first claim on editor-level shortcuts before
    // Chromium or Monaco can treat Cmd/Ctrl+Plus and Cmd/Ctrl+Minus as window
    // zoom. Without that ordering, the same shortcut can resize the whole app
    // instead of persisting the editor font size setting.
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onSaveSettings, onSetZenMode, runCommand, settings, zenMode]);
}
