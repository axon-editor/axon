// Manages shared Monaco editor models keyed by file path.
// When multiple panes open the same file they share one model so edits
// in one pane are instantly visible in all others without saving.
// Models are created on first open and disposed when no editors reference them.
import * as monaco from "monaco-editor";

// refCount tracks how many editor instances are using each model
// so we only dispose when the last one unmounts
const models = new Map<string, monaco.editor.ITextModel>();
const refCounts = new Map<string, number>();

function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    go: "go",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
  };
  return map[ext ?? ""] ?? "plaintext";
}

// getOrCreateModel returns the shared model for a file path.
// Creates it with the given content if it doesn't exist yet.
export function getOrCreateModel(
  filePath: string,
  content: string,
): monaco.editor.ITextModel {
  const existing = models.get(filePath);

  // if existing model is disposed create a fresh one
  if (existing && !existing.isDisposed()) {
    refCounts.set(filePath, (refCounts.get(filePath) ?? 0) + 1);
    return existing;
  }

  const model = monaco.editor.createModel(
    content,
    detectLanguage(filePath),
    monaco.Uri.file(filePath),
  );

  models.set(filePath, model);
  refCounts.set(filePath, 1);
  return model;
}

// updateModel pushes new content into the shared model.
// Used when an external change (chokidar) updates the file on disk.
// All editors sharing the model see the update instantly.
export function updateModel(filePath: string, content: string) {
  const model = models.get(filePath);
  if (!model) return;
  // only update if content actually changed to avoid cursor jumping
  if (model.getValue() !== content) {
    model.setValue(content);
  }
}

// releaseModel decrements the ref count and disposes the model
// when no editors are using it anymore.
// Uses a small delay before disposing to avoid race conditions
// where a new editor mounts before the old cleanup finishes.
export function releaseModel(filePath: string) {
  const count = refCounts.get(filePath) ?? 0;
  if (count <= 1) {
    refCounts.delete(filePath);
    const model = models.get(filePath);
    models.delete(filePath);
    // delay disposal so any mounting editor can still access the model
    setTimeout(() => {
      if (!model?.isDisposed()) {
        model?.dispose();
      }
    }, 500);
  } else {
    refCounts.set(filePath, count - 1);
  }
}

// getModel returns the model for a path if it exists
export function getModel(
  filePath: string,
): monaco.editor.ITextModel | undefined {
  return models.get(filePath);
}
