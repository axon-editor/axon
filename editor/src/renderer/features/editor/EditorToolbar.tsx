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
            className="mr-1 flex h-7 cursor-pointer items-center gap-1.5 rounded border border-[#2a3346] bg-[#142a36] px-2.5 text-[11px] text-[#80c8e0] transition-colors hover:border-[#80c8e0] hover:text-white"
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
            <Tooltip label="New..." side="bottom">
              <button
                onClick={() => toggle("new")}
                aria-label="New..."
                className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer
                ${dropdown === "new" ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"}`}
              >
                <Plus size={14} />
              </button>
            </Tooltip>

            {dropdown === "new" && (
              <div className="axon-popover absolute right-0 top-8 z-50 w-48 rounded-lg border border-[#222838] bg-[#14161e] py-1 shadow-2xl">
                <button
                  onClick={() => {
                    onNewFile();
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
                >
                  <FileText size={13} className="shrink-0" />
                  new file
                </button>
                <button
                  onClick={() => {
                    onOpenFile();
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
                >
                  <FolderOpen size={13} className="shrink-0" />
                  open file
                </button>
                <div className="my-1 border-t border-[#222838]" />
                <button
                  onClick={() => {
                    onNewTerminal();
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
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
            <Tooltip label="Split editor" side="bottom">
              <button
                onClick={() => toggle("split")}
                aria-label="Split editor"
                className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer
                ${dropdown === "split" ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"}`}
              >
                <Columns2 size={14} />
              </button>
            </Tooltip>

            {dropdown === "split" && (
              <div className="axon-popover absolute right-0 top-8 z-50 w-48 rounded-lg border border-[#222838] bg-[#14161e] py-1 shadow-2xl">
                <button
                  onClick={() => {
                    onSplit("right");
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
                >
                  <AlignEndVertical size={13} className="shrink-0" />
                  split right
                </button>
                <button
                  onClick={() => {
                    onSplit("left");
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
                >
                  <AlignStartVertical size={13} className="shrink-0" />
                  split left
                </button>
                <button
                  onClick={() => {
                    onSplit("up");
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
                >
                  <AlignStartHorizontal size={13} className="shrink-0" />
                  split up
                </button>
                <button
                  onClick={() => {
                    onSplit("down");
                    setDropdown(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] hover:bg-[#1e2430] hover:text-white transition-colors cursor-pointer"
                >
                  <AlignEndHorizontal size={13} className="shrink-0" />
                  split down
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />

          <Tooltip label="Compare active file" side="bottom">
            <button
              onClick={onDiff}
              aria-label="Compare active file"
              className="flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"
            >
              <GitCompare size={14} />
            </button>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-[var(--axon-panel-border)]" />
        </>
      )}

      <Tooltip label={isZenMode ? "Exit zen mode" : "Zen mode"} side="bottom">
        <button
          onClick={onZenMode}
          aria-label={isZenMode ? "Exit zen mode" : "Zen mode"}
          className={`flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer
          ${isZenMode ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:text-[#9aa4b8] hover:bg-[#1e2430]"}`}
        >
          {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </Tooltip>

      <div ref={appRef} className="relative">
        <Tooltip label="Axon menu" side="bottom">
          <button
            onClick={() => toggle("app")}
            aria-label="Axon menu"
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors
            ${dropdown === "app" ? "bg-[#1e2430] text-[#80c8e0]" : "text-[#586478] hover:bg-[#1e2430] hover:text-[#9aa4b8]"}`}
          >
            <ChevronDown size={15} />
          </button>
        </Tooltip>

        {dropdown === "app" && (
          <div className="axon-popover absolute right-0 top-8 z-50 w-52 rounded-lg border border-[#222838] bg-[#14161e] py-1 shadow-2xl">
            <button
              onClick={() => {
                onSettings();
                setDropdown(null);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#1e2430] hover:text-white"
            >
              <Settings size={13} className="shrink-0" />
              settings
            </button>
            <button
              onClick={() => {
                onExtensions();
                setDropdown(null);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#1e2430] hover:text-white"
            >
              <Blocks size={13} className="shrink-0" />
              extensions
            </button>
            <button
              onClick={() => {
                onAbout();
                setDropdown(null);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-[#9aa4b8] transition-colors hover:bg-[#1e2430] hover:text-white"
            >
              <Info size={13} className="shrink-0" />
              about Axon
            </button>
            {updateInfo?.updateAvailable ? (
              <>
                <div className="my-1 border-t border-[#222838]" />
                <button
                  onClick={() => {
                    onOpenUpdate();
                    setDropdown(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-[#80c8e0] transition-colors hover:bg-[#1e2430] hover:text-white"
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
