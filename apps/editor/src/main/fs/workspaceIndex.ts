import fs from "fs";
import path from "path";
import {
  type WorkspaceIndexFile,
  type WorkspaceIndexSummary,
} from "../../shared/workspaceIndex";
import { listProjectFiles } from "./projectFiles";

const workspaceIndexCache = new Map<
  string,
  { generatedAtMs: number; summary: WorkspaceIndexSummary }
>();

const languageByExtension: Record<string, string> = {
  ".astro": "astro",
  ".bash": "shellscript",
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".go": "go",
  ".graphql": "graphql",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".json": "json",
  ".kt": "kotlin",
  ".lua": "lua",
  ".md": "markdown",
  ".mdx": "mdx",
  ".php": "php",
  ".prisma": "prisma",
  ".py": "python",
  ".rs": "rust",
  ".scss": "scss",
  ".sh": "shellscript",
  ".svelte": "svelte",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".vue": "vue",
  ".yaml": "yaml",
  ".yml": "yaml",
};

function getLanguageId(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return languageByExtension[extension] ?? null;
}

export function invalidateWorkspaceIndex(folderPath?: string | null) {
  if (!folderPath) {
    workspaceIndexCache.clear();
    return;
  }
  workspaceIndexCache.delete(path.resolve(folderPath));
}

export function getWorkspaceIndex(
  folderPath: string,
  limit = 50000,
): WorkspaceIndexSummary {
  const workspacePath = path.resolve(folderPath);
  const cached = workspaceIndexCache.get(workspacePath);
  if (cached && Date.now() - cached.generatedAtMs < 5000) {
    return cached.summary;
  }

  const files = listProjectFiles(workspacePath, limit);
  const languageCounts: Record<string, number> = {};
  const indexedFiles: WorkspaceIndexFile[] = [];

  for (const file of files) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file.path);
    } catch {
      continue;
    }

    const languageId = getLanguageId(file.path);
    if (languageId) {
      languageCounts[languageId] = (languageCounts[languageId] ?? 0) + 1;
    }

    indexedFiles.push({
      name: file.name,
      path: file.path,
      relativePath: path.relative(workspacePath, file.path),
      extension: path.extname(file.path).toLowerCase(),
      languageId,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  // This is intentionally a metadata index, not a content index yet. It gives
  // file search, test discovery, symbol indexing, and extension activation a
  // shared project-aware base without reading every file into memory during
  // workspace open. Content/symbol indexing can layer on this and decide which
  // language/provider should parse each file.
  const summary: WorkspaceIndexSummary = {
    workspacePath,
    generatedAt: new Date().toISOString(),
    indexedFileCount: indexedFiles.length,
    truncated: indexedFiles.length >= limit,
    languageCounts,
    files: indexedFiles,
  };
  workspaceIndexCache.set(workspacePath, { generatedAtMs: Date.now(), summary });
  return summary;
}
