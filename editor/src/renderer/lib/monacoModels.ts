// Manages shared Monaco editor models keyed by file path.
// Multiple panes opening the same file share one model so edits
// reflect instantly across all panes without saving.
// Ref counting ensures the model is only disposed when all editors release it.
import * as monaco from "monaco-editor";

const models = new Map<string, monaco.editor.ITextModel>();
const refCounts = new Map<string, number>();
const disposalTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

// acquireModel increments the ref count and returns the model.
// Creates the model if it doesn't exist yet.
// Always call this once per editor instance that opens a file.
export function acquireModel(
  filePath: string,
  content: string,
): monaco.editor.ITextModel {
  const pendingDisposal = disposalTimers.get(filePath);
  if (pendingDisposal) {
    clearTimeout(pendingDisposal);
    disposalTimers.delete(filePath);
  }

  const existing = models.get(filePath);

  if (existing && !existing.isDisposed()) {
    refCounts.set(filePath, (refCounts.get(filePath) ?? 0) + 1);
    return existing;
  }

  // create a fresh model, previous one may have been disposed
  const uri = monaco.Uri.file(filePath);

  // check if Monaco already has a model for this URI from a previous session
  const existingByUri = monaco.editor.getModel(uri);
  if (existingByUri && !existingByUri.isDisposed()) {
    models.set(filePath, existingByUri);
    refCounts.set(filePath, (refCounts.get(filePath) ?? 0) + 1);
    return existingByUri;
  }

  const model = monaco.editor.createModel(
    content,
    detectLanguage(filePath),
    uri,
  );

  models.set(filePath, model);
  refCounts.set(filePath, 1);
  return model;
}

// releaseModel decrements ref count and disposes when no editors reference it.
// Always call this in the cleanup of the useEffect that called acquireModel.
export function releaseModel(filePath: string) {
  const count = refCounts.get(filePath) ?? 0;
  if (count <= 0) return;

  if (count <= 1) {
    const model = models.get(filePath);
    refCounts.set(filePath, 0);

    // Monaco models are shared by every mounted editor showing the same file.
    // A split can be opened and closed before its async file read finishes, so
    // disposal is delayed and cancellation-aware. If another pane reacquires the
    // same model during that window, acquireModel clears this timer and the
    // remaining editor keeps its model instead of being left with a disposed
    // document.
    const timer = setTimeout(() => {
      disposalTimers.delete(filePath);

      if (
        model &&
        models.get(filePath) === model &&
        (refCounts.get(filePath) ?? 0) <= 0 &&
        !model.isDisposed()
      ) {
        model.dispose();
        models.delete(filePath);
        refCounts.delete(filePath);
      }
    }, 500);

    disposalTimers.set(filePath, timer);
  } else {
    refCounts.set(filePath, count - 1);
  }
}

// updateModel pushes new content into the shared model.
// All editors sharing the model see the update instantly.
export function updateModel(filePath: string, content: string) {
  const model = models.get(filePath);
  if (!model || model.isDisposed()) return;
  if (model.getValue() !== content) {
    model.setValue(content);
  }
}

// getModel returns the model for a path if it exists and is not disposed
export function getModel(
  filePath: string,
): monaco.editor.ITextModel | undefined {
  const model = models.get(filePath);
  if (!model || model.isDisposed()) return undefined;
  return model;
}
