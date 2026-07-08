// Top right toolbar with three icon buttons.
// Plus opens a new action dropdown below the button.
// Split opens layout options dropdown.
// Maximize toggles zen mode.
import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Columns2,
  Maximize2,
  Minimize2,
  Terminal,
  FileText,
  FolderOpen,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  Settings,
  ChevronDown,
  GitCompare,
  Download,
  Blocks,
  Info,
  Bug,
} from "lucide-react";
import Tooltip from "../../shared/components/Tooltip";
import { type UpdateInfo, type UpdateInstallState } from "../../../shared/updates";

interface Props {
  onNewFile: () => void;
  onOpenFile: () => void;
  onDiff: () => void;
  onNewTerminal: () => void;
  onSplit: (direction: "right" | "left" | "up" | "down") => void;
  onZenMode: () => void;
  onSettings: () => void;
  onExtensions: () => void;
  onAbout: () => void;
  updateInfo: UpdateInfo | null;
  updateInstallState: UpdateInstallState;
  onOpenUpdate: () => void;
  isZenMode: boolean;
  hasWorkspace: boolean;
  hasActiveFile: boolean;
}

type DropdownType = "new" | "split" | "app" | null;

const toolbarButtonBase =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors";
const toolbarButtonIdle =
  "text-[#586478] hover:bg-[var(--axon-panel-overlay-hover)] hover:text-[#9aa4b8]";
const toolbarButtonActive =
  "bg-[var(--axon-panel-overlay-hover)] text-[var(--axon-syntax-function)]";
const toolbarMenu =
  "axon-popover absolute right-0 top-8 z-50 rounded-lg border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] py-1 shadow-2xl";
const toolbarMenuItem =
  "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--axon-editor-foreground)] opacity-68 transition-colors hover:bg-[var(--axon-panel-overlay-hover)] hover:opacity-100";

export default function EditorToolbar({
  onNewFile,
  onOpenFile,
  onDiff,
  onNewTerminal,
  onSplit,
  onZenMode,
  onSettings,
  onExtensions,
  onAbout,
  updateInfo,
  updateInstallState,
  onOpenUpdate,
  isZenMode,
  hasWorkspace,
  hasActiveFile,
}: Props) {
  const [dropdown, setDropdown] = useState<DropdownType>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideToolbarPopover = [newRef, splitRef, appRef].some((ref) =>
        ref.current?.contains(target),
      );

      if (!isInsideToolbarPopover) {
        setDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (type: DropdownType) => {
    setDropdown((prev) => (prev === type ? null : type));
  };

  const updatePhase = updateInstallState.phase;
  const updateDownloadProgress = Math.round(updateInstallState.percent ?? 0);
  const updateButtonLabel =
    updatePhase === "downloading"
      ? `Downloading ${updateDownloadProgress}%`
      : updatePhase === "downloaded"
        ? "Restart to Update"
        : updatePhase === "installing"
          ? "Restarting..."
          : updatePhase === "checking"
            ? "Checking..."
            : "Update";
  return (
    <div className="flex items-center gap-0.5 px-2">
      {updateInfo?.updateAvailable ? (
        <Tooltip
          label={
            updatePhase === "downloaded"
              ? `Restart to apply Axon ${updateInfo.latestVersion}`
              : updatePhase === "installing"
                ? `Restarting Axon to apply ${updateInfo.latestVersion}`
                : updatePhase === "downloading"
                  ? `Downloading Axon ${updateInfo.latestVersion}`
                  : `View Axon ${updateInfo.latestVersion} update notes`
          }
          side="bottom"
        >
          <button
            onClick={onOpenUpdate}
            aria-label={`View Axon ${updateInfo.latestVersion} update notes`}
            className="mr-1 flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-2.5 text-[11px] text-[var(--axon-syntax-function)] transition-colors hover:border-[var(--axon-syntax-function)] hover:bg-[var(--axon-panel-overlay-hover)]"
          >
            <Download size={13} />
            {updateButtonLabel}
          </button>
        </Tooltip>
      ) : null}
      {updateInfo?.updateAvailable ? (
        <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
      ) : null}

      {hasWorkspace && (
        <>
          <div ref={newRef} className="relative">
            <Tooltip label="New... (toolbar menu)" side="bottom">
              <button
                onClick={() => toggle("new")}
                aria-label="New..."
                className={`${toolbarButtonBase} ${
                  dropdown === "new" ? toolbarButtonActive : toolbarButtonIdle
                }`}
              >
                <Plus size={14} />
              </button>
            </Tooltip>

            {dropdown === "new" && (
              <div className={`${toolbarMenu} w-48`}>
                <button
                  onClick={() => {
                    onNewFile();
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <FileText size={13} className="shrink-0" />
                  new file
                </button>
                <button
                  onClick={() => {
                    onOpenFile();
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <FolderOpen size={13} className="shrink-0" />
                  open file
                </button>
                <div className="my-1 border-t border-[var(--axon-panel-border)]" />
                <button
                  onClick={() => {
                    onNewTerminal();
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <Terminal size={13} className="shrink-0" />
                  new terminal
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
        </>
      )}

      {hasActiveFile && (
        <>
          <div ref={splitRef} className="relative">
            <Tooltip label="Split editor (pane menu)" side="bottom">
              <button
                onClick={() => toggle("split")}
                aria-label="Split editor"
                className={`${toolbarButtonBase} ${
                  dropdown === "split" ? toolbarButtonActive : toolbarButtonIdle
                }`}
              >
                <Columns2 size={14} />
              </button>
            </Tooltip>

            {dropdown === "split" && (
              <div className={`${toolbarMenu} w-48`}>
                <button
                  onClick={() => {
                    onSplit("right");
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <AlignEndVertical size={13} className="shrink-0" />
                  split right
                </button>
                <button
                  onClick={() => {
                    onSplit("left");
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <AlignStartVertical size={13} className="shrink-0" />
                  split left
                </button>
                <button
                  onClick={() => {
                    onSplit("up");
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <AlignStartHorizontal size={13} className="shrink-0" />
                  split up
                </button>
                <button
                  onClick={() => {
                    onSplit("down");
                    setDropdown(null);
                  }}
                  className={toolbarMenuItem}
                >
                  <AlignEndHorizontal size={13} className="shrink-0" />
                  split down
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />

          <Tooltip label="Compare active file (Git diff)" side="bottom">
            <button
              onClick={onDiff}
              aria-label="Compare active file"
              className={`${toolbarButtonBase} ${toolbarButtonIdle}`}
            >
              <GitCompare size={14} />
            </button>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
        </>
      )}

      <Tooltip
        label={isZenMode ? "Exit zen mode (Cmd+K Z)" : "Zen mode (Cmd+K Z)"}
        side="bottom"
      >
        <button
          onClick={onZenMode}
          aria-label={isZenMode ? "Exit zen mode" : "Zen mode"}
          className={`${toolbarButtonBase} ${
            isZenMode ? toolbarButtonActive : toolbarButtonIdle
          }`}
        >
          {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </Tooltip>

      <div ref={appRef} className="relative">
        <Tooltip label="Axon menu (settings and extensions)" side="bottom">
          <button
            onClick={() => toggle("app")}
            aria-label="Axon menu"
            className={`${toolbarButtonBase} ${
              dropdown === "app" ? toolbarButtonActive : toolbarButtonIdle
            }`}
          >
            <ChevronDown size={15} />
          </button>
        </Tooltip>

        {dropdown === "app" && (
          <div className={`${toolbarMenu} w-52`}>
            <button
              onClick={() => {
                onSettings();
                setDropdown(null);
              }}
              className={toolbarMenuItem}
            >
              <Settings size={13} className="shrink-0" />
              settings
            </button>
            <button
              onClick={() => {
                onExtensions();
                setDropdown(null);
              }}
              className={toolbarMenuItem}
            >
              <Blocks size={13} className="shrink-0" />
              extensions
            </button>
            <button
              onClick={() => {
                onAbout();
                setDropdown(null);
              }}
              className={toolbarMenuItem}
            >
              <Info size={13} className="shrink-0" />
              about Axon
            </button>
            <button
              onClick={() => {
                setDropdown(null);
                void window.axon.openDevTools();
              }}
              className={toolbarMenuItem}
            >
              <Bug size={13} className="shrink-0" />
              inspect console
            </button>
            {updateInfo?.updateAvailable ? (
              <>
                <div className="my-1 border-t border-[var(--axon-panel-border)]" />
                <button
                  onClick={() => {
                    onOpenUpdate();
                    setDropdown(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-[var(--axon-syntax-function)] transition-colors hover:bg-[var(--axon-panel-overlay-hover)]"
                >
                  <Download size={13} className="shrink-0" />
                  update notes
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
