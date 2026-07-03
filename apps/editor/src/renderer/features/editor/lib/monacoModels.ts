// Manages shared Monaco editor models keyed by file path.
// Multiple panes opening the same file share one model so edits
// reflect instantly across all panes without saving.
// Ref counting ensures the model is only disposed when all editors release it.
import * as monaco from "monaco-editor";
import { registerMonacoReactLanguages } from "./monacoReactLanguages";

const models = new Map<string, monaco.editor.ITextModel>();
const refCounts = new Map<string, number>();
const disposalTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function detectLanguage(path: string): string {
  return detectMonacoLanguage(path);
}

export function detectMonacoLanguage(path: string): string {
  const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const ext = path.split(".").pop()?.toLowerCase();

  // Basename-sensitive files need to be handled before extension lookup
  // because files like Dockerfile, .env.local, and .gitignore either have no
  // useful extension or use a dot-prefix that would otherwise be mistaken for
  // a normal extension. Mapping them here keeps syntax highlighting, snippets,
  // and LSP startup tied to the file's real role instead of falling back to
  // plaintext.
  if (
    fileName === ".env" ||
    fileName === ".envrc" ||
    fileName.startsWith(".env.")
  ) {
    return "shell";
  }

  if (
    fileName === "dockerfile" ||
    fileName.startsWith("dockerfile.") ||
    fileName === ".dockerignore"
  ) {
    return "dockerfile";
  }

  if (
    fileName === ".gitignore" ||
    fileName === ".ignore" ||
    fileName.endsWith("ignore")
  ) {
    return "gitignore";
  }

  if (
    fileName === "tsconfig.json" ||
    fileName === "jsconfig.json" ||
    ext === "jsonc"
  ) {
    return "json";
  }

  // Monaco already ships a C/C++ contribution, but Axon has to map the file
  // extension to that language explicitly. If we leave these extensions out,
  // the editor falls back to plaintext and the file loses both syntax
  // highlighting and the language-specific worker behavior that Monaco can
  // provide out of the box.
  const map: Record<string, string> = {
    c: "cpp",
    cc: "cpp",
    cpp: "cpp",
    cxx: "cpp",
    h: "cpp",
    hh: "cpp",
    hpp: "cpp",
    hxx: "cpp",
    cplusplus: "cpp",
    go: "go",
    rs: "rust",
    ts: "typescript",
    tsx: "typescriptreact",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascriptreact",
    py: "python",
    pyi: "python",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    cs: "csharp",
    swift: "swift",
    rb: "ruby",
    lua: "lua",
    php: "php",
    sql: "sql",
    dart: "dart",
    xml: "xml",
    svg: "xml",
    md: "markdown",
    markdown: "markdown",
    json: "json",
    jsonc: "json",
    json5: "json",
    css: "css",
    scss: "scss",
    sass: "scss",
    less: "less",
    astro: "html",
    html: "html",
    htm: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
  };
  return map[ext ?? ""] ?? "plaintext";
}

export function detectLanguageServerLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();

  // React documents have to keep their React language ids all the way into the
  // protocol layer. If `.tsx` is ever collapsed back to `typescript`, the
  // server can parse JSX tags as invalid TypeScript and features like Tailwind,
  // package export completions, and component definitions lose the context they
  // need to behave like a production IDE.
  if (ext === "tsx") return "typescriptreact";
  if (ext === "jsx") return "javascriptreact";
  if (ext === "astro") return "astro";

  return detectMonacoLanguage(path);
}

// acquireModel increments the ref count and returns the model.
// Creates the model if it doesn't exist yet.
// Always call this once per editor instance that opens a file.
export function acquireModel(
  filePath: string,
  content: string,
): monaco.editor.ITextModel {
  registerMonacoReactLanguages();

  const pendingDisposal = disposalTimers.get(filePath);
  if (pendingDisposal) {
    clearTimeout(pendingDisposal);
    disposalTimers.delete(filePath);
  }

  const existing = models.get(filePath);

  if (existing && !existing.isDisposed()) {
    const languageId = detectLanguage(filePath);
    if (existing.getLanguageId() !== languageId) {
      monaco.editor.setModelLanguage(existing, languageId);
    }
    refCounts.set(filePath, (refCounts.get(filePath) ?? 0) + 1);
    return existing;
  }

  // create a fresh model, previous one may have been disposed
  const uri = monaco.Uri.file(filePath);

  // check if Monaco already has a model for this URI from a previous session
  const existingByUri = monaco.editor.getModel(uri);
  if (existingByUri && !existingByUri.isDisposed()) {
    const languageId = detectLanguage(filePath);
    if (existingByUri.getLanguageId() !== languageId) {
      monaco.editor.setModelLanguage(existingByUri, languageId);
    }
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
      }
      if ((refCounts.get(filePath) ?? 0) <= 0 && models.get(filePath) === model) {
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
