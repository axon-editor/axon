import { useEffect, useRef, useState, type FormEvent } from "react";
import { FolderOpen, GitFork } from "lucide-react";
import CommandModal from "../../../shared/components/CommandModal";
import { type WorkspaceRoot } from "../../../shared/lib/workspaceRoots";
import { type GitCloneProgress } from "../../../../shared/git";
import FolderPickerClone from "./folderPicker/FolderPickerClone";
import FolderPickerLocal from "./folderPicker/FolderPickerLocal";

interface Props {
  recentFolders: string[];
  workspaceRoots?: WorkspaceRoot[];
  activeRootId?: string | null;
  onSelect: (path: string) => void;
  onSelectWorkspaceRoot?: (path: string) => void;
  onOpenNew: () => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onClearSession: () => void;
  onClose: () => void;
}

type FolderPickerMode = "local" | "clone";

const modes: Array<{
  id: FolderPickerMode;
  label: string;
  icon: typeof FolderOpen;
}> = [
  { id: "local", label: "Local folders", icon: FolderOpen },
  { id: "clone", label: "Clone repository", icon: GitFork },
];

export default function FolderPicker({
  recentFolders,
  workspaceRoots = [],
  activeRootId = null,
  onSelect,
  onSelectWorkspaceRoot,
  onOpenNew,
  onRemoveRecent,
  onClearRecent,
  onClearSession,
  onClose,
}: Props) {
  const [mode, setMode] = useState<FolderPickerMode>("local");
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<GitCloneProgress | null>(
    null,
  );
  const cloneRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return window.axon.onGitCloneProgress((event) => {
      if (event.requestId !== cloneRequestIdRef.current) return;
      setCloneProgress({
        phase: event.phase,
        percent: event.percent,
        message: event.message,
      });
    });
  }, []);

  const runAfterClose = (action: () => void) => {
    onClose();

    // Workspace replacement touches the editor layout, file tree, language
    // services, Git, terminals, and persisted session. Letting the picker
    // unmount before that transition gives React one clear ownership handoff
    // and prevents the closing modal from competing with the new workspace.
    window.requestAnimationFrame(action);
  };

  const cloneRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cloning) return;

    const url = repositoryUrl.trim();
    if (!url) {
      setCloneError("Enter a repository URL.");
      return;
    }

    setCloning(true);
    setCloneError(null);
    const requestId = globalThis.crypto.randomUUID();
    cloneRequestIdRef.current = requestId;
    setCloneProgress({
      phase: "starting",
      percent: null,
      message: "Choose clone destination",
    });

    try {
      const result = await window.axon.cloneGitRepository(url, requestId);
      if (result.canceled) {
        setCloneProgress(null);
        return;
      }
      if (!result.ok || !result.folderPath) {
        setCloneError(result.message || "Git clone failed.");
        return;
      }

      runAfterClose(() => onSelect(result.folderPath!));
    } catch (error) {
      setCloneError(
        error instanceof Error
          ? error.message
          : "Git clone failed unexpectedly.",
      );
    } finally {
      cloneRequestIdRef.current = null;
      setCloning(false);
    }
  };

  return (
    <CommandModal
      title="open folder"
      onClose={onClose}
      width="w-[min(760px,calc(100vw-2rem))]"
      bodyClassName="flex min-h-0 flex-1 overflow-hidden"
      panelStyle={{
        height: "min(620px, calc(100vh - 3rem))",
        minHeight: "min(520px, calc(100vh - 3rem))",
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          role="tablist"
          aria-label="Open folder source"
          className="flex h-11 shrink-0 items-end gap-1 border-b border-[var(--axon-panel-border)] px-4"
        >
          {modes.map((item) => {
            const Icon = item.icon;
            const active = item.id === mode;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(item.id)}
                className={`relative flex h-10 cursor-pointer items-center gap-2 px-3 text-[12px] transition-colors ${
                  active
                    ? "text-[var(--axon-editor-foreground)]"
                    : "text-[var(--axon-editor-foreground)] opacity-45 hover:opacity-80"
                }`}
              >
                <Icon size={14} />
                <span>{item.label}</span>
                {active ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[var(--axon-syntax-function)]" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className={mode === "local" ? "flex min-h-0 flex-1" : "hidden"}>
          <FolderPickerLocal
            activeRootId={activeRootId}
            recentFolders={recentFolders}
            workspaceRoots={workspaceRoots}
            onBrowse={() => runAfterClose(onOpenNew)}
            onClearRecent={onClearRecent}
            onClearSession={onClearSession}
            onRemoveRecent={onRemoveRecent}
            onSelect={(path) => runAfterClose(() => onSelect(path))}
            onSelectWorkspaceRoot={(path) =>
              runAfterClose(() => onSelectWorkspaceRoot?.(path))
            }
          />
        </div>

        <div className={mode === "clone" ? "flex min-h-0 flex-1" : "hidden"}>
          <FolderPickerClone
            cloneError={cloneError}
            cloneProgress={cloneProgress}
            cloning={cloning}
            repositoryUrl={repositoryUrl}
            onRepositoryUrlChange={(value) => {
              setRepositoryUrl(value);
              if (cloneError) setCloneError(null);
            }}
            onSubmit={cloneRepository}
          />
        </div>
      </div>
    </CommandModal>
  );
}
