import { useEffect, useMemo, useRef, useState } from "react";
import { Hammer, Play } from "lucide-react";
import { type WorkspaceTask } from "../../shared/tasks";
import CommandModal from "./CommandModal";

interface Props {
  folderPath: string | null;
  open: boolean;
  onClose: () => void;
  onRunTask: (task: WorkspaceTask) => void;
}

function taskSearchText(task: WorkspaceTask) {
  return `${task.label} ${task.detail} ${task.kind}`.toLowerCase();
}

export default function TaskRunnerModal({
  folderPath,
  open,
  onClose,
  onRunTask,
}: Props) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    if (!folderPath) {
      setTasks([]);
      return;
    }

    setLoading(true);
    window.axon
      .listWorkspaceTasks(folderPath)
      .then(setTasks)
      .catch((err) => {
        console.error("failed to list tasks:", err);
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [folderPath, open]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tasks;
    return tasks.filter((task) =>
      taskSearchText(task).includes(normalizedQuery),
    );
  }, [query, tasks]);

  const selectedTask = filteredTasks[selectedIndex];

  const runSelectedTask = (task: WorkspaceTask) => {
    onRunTask(task);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) =>
        Math.min(index + 1, filteredTasks.length - 1),
      );
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && selectedTask) {
      runSelectedTask(selectedTask);
    }
    if (event.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <CommandModal title="run task" onClose={onClose} width="w-[720px]">
      <div className="flex items-center gap-2 border-b border-[#222838] px-4 py-3">
        <Hammer size={14} className="shrink-0 text-[#586478]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="search tasks..."
          className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder-[#364050]"
        />
      </div>

      <div className="max-h-96 overflow-y-auto py-1">
        {!folderPath && (
          <div className="px-4 py-3 text-[12px] text-[#586478]">
            Open a folder to run workspace tasks.
          </div>
        )}
        {folderPath && loading && (
          <div className="px-4 py-3 text-[12px] text-[#586478]">
            loading tasks...
          </div>
        )}
        {folderPath && !loading && filteredTasks.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-[#586478]">
            No tasks found in this workspace.
          </div>
        )}
        {filteredTasks.map((task, index) => (
          <button
            key={task.id}
            onClick={() => runSelectedTask(task)}
            className={`grid w-full cursor-pointer grid-cols-[20px_1fr] items-center gap-3 px-4 py-2.5 text-left transition-colors ${
              index === selectedIndex
                ? "bg-[#1e2430] text-white"
                : "text-[#9aa4b8] hover:bg-[#14161e] hover:text-white"
            }`}
          >
            <Play size={13} className="text-[#80c8e0]" />
            <span className="min-w-0">
              <span className="block truncate text-[12px]">{task.label}</span>
              <span className="block truncate text-[10px] text-[#586478]">
                {task.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
    </CommandModal>
  );
}
