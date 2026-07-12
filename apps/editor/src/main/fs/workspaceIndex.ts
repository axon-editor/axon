import fs from "fs/promises";
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
const workspaceIndexRequests = new Map<
  string,
  Promise<WorkspaceIndexSummary>
>();
const STAT_CONCURRENCY = 256;

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

async function buildWorkspaceIndex(
  workspacePath: string,
  limit: number,
): Promise<WorkspaceIndexSummary> {
  const files = await listProjectFiles(workspacePath, limit);
  const languageCounts: Record<string, number> = {};
  const indexedFiles: WorkspaceIndexFile[] = [];

  // Stat calls are independent and safe to overlap, but an unbounded
  // Promise.all over a large repository can overwhelm the process and OS. This
  // bounded loop keeps the main thread responsive while maintaining enough I/O
  // concurrency for SSD-backed projects to index quickly.
  for (let offset = 0; offset < files.length; offset += STAT_CONCURRENCY) {
    const entries = await Promise.all(
      files.slice(offset, offset + STAT_CONCURRENCY).map(async (file) => {
        try {
          return { file, stat: await fs.stat(file.path) };
        } catch {
          return null;
        }
      }),
    );

    for (const entry of entries) {
      if (!entry) continue;
      const { file, stat } = entry;
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
  }

  const summary: WorkspaceIndexSummary = {
    workspacePath,
    generatedAt: new Date().toISOString(),
    indexedFileCount: indexedFiles.length,
    truncated: indexedFiles.length >= limit,
    languageCounts,
    files: indexedFiles,
  };
  workspaceIndexCache.set(workspacePath, {
    generatedAtMs: Date.now(),
    summary,
  });
  return summary;
}

export async function getWorkspaceIndex(
  folderPath: string,
  limit = 50000,
): Promise<WorkspaceIndexSummary> {
  const workspacePath = path.resolve(folderPath);
  const cached = workspaceIndexCache.get(workspacePath);
  if (cached && Date.now() - cached.generatedAtMs < 5000) {
    return cached.summary;
  }

  // This is intentionally a metadata index, not a content index yet. It gives
  // file search, test discovery, symbol indexing, and extension activation a
  // shared project-aware base without reading every file into memory during
  // workspace open. Content/symbol indexing can layer on this and decide which
  // language/provider should parse each file.
  const existingRequest = workspaceIndexRequests.get(workspacePath);
  if (existingRequest) return existingRequest;

  const request = buildWorkspaceIndex(workspacePath, limit).finally(() => {
    if (workspaceIndexRequests.get(workspacePath) === request) {
      workspaceIndexRequests.delete(workspacePath);
    }
  });
  workspaceIndexRequests.set(workspacePath, request);
  return request;
}
