// Thin client for communicating with axon-core (Go backend).
// All requests go through here, centralizes the base URL and
// response envelope unwrapping so components never deal with raw fetch.
// Every method returns the `data` field from the response envelope,
// or throws an error with the `error` field from the envelope.

import { authenticatedCoreFetch } from "./coreBackend";

// AxonResponse mirrors the standard envelope from axon-core
interface AxonResponse<T = unknown> {
  status: string;
  message?: string;
  data?: T;
  error?: string;
  request_id: string;
  timestamp: string;
}

// FileNode mirrors the FileNode struct from internal/fs/fs.go
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

// FileContent mirrors the FileContent struct from internal/fs/fs.go
export interface FileContent {
  path: string;
  content: string;
}

export interface WorkspaceSearchResult {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface WorkspaceReplaceResult {
  files_changed: number;
  replacements: number;
}

let activeWorkspaceRoot: string | null = null;
const authorizedWorkspaceRoots = new Set<string>();

async function authorizeWorkspaceRoot(root: string) {
  if (authorizedWorkspaceRoots.has(root)) return;
  const authorizedRoot = await window.axon.authorizeWorkspaceRoot(root);
  authorizedWorkspaceRoots.add(root);
  authorizedWorkspaceRoots.add(authorizedRoot);
}

function normalizedPath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function pathIsInsideRoot(filePath: string, rootPath: string) {
  const pathValue = normalizedPath(filePath);
  const rootValue = normalizedPath(rootPath);
  return pathValue === rootValue || pathValue.startsWith(`${rootValue}/`);
}

function parentPath(filePath: string) {
  const normalized = normalizedPath(filePath);
  const separator = normalized.lastIndexOf("/");
  return separator > 0 ? normalized.slice(0, separator) : normalized;
}

function workspaceRootFor(filePath: string, explicitRoot?: string) {
  if (explicitRoot) return explicitRoot;
  if (activeWorkspaceRoot && pathIsInsideRoot(filePath, activeWorkspaceRoot)) {
    return activeWorkspaceRoot;
  }

  // Axon can intentionally open a user settings file outside the project. In
  // that case the narrowest useful capability is its parent directory, not an
  // unrestricted filesystem root.
  return parentPath(filePath);
}

// request is the internal helper that handles fetch + envelope unwrapping
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await authenticatedCoreFetch(path, options);
  const json: AxonResponse<T> = await res.json();

  if (json.status !== "ok") {
    throw new Error(json.error ?? "unknown error from axon-core");
  }

  return json.data as T;
}

// getTree fetches the recursive file tree for the given root path
export async function getTree(path: string, root?: string): Promise<FileNode> {
  const requestedRoot = root ??
    (activeWorkspaceRoot && pathIsInsideRoot(path, activeWorkspaceRoot)
      ? activeWorkspaceRoot
      : path);
  activeWorkspaceRoot = requestedRoot;
  await authorizeWorkspaceRoot(requestedRoot);
  return request<FileNode>(
    `/fs/tree?path=${encodeURIComponent(path)}&root=${encodeURIComponent(requestedRoot)}`,
  );
}

// readFile fetches the content of a file at the given path
export async function readFile(path: string, root?: string): Promise<FileContent> {
  const requestedRoot = workspaceRootFor(path, root);
  return window.axon.readTextFile(path, requestedRoot);
}

// writeFile saves content to a file at the given path
export async function writeFile(
  path: string,
  content: string,
  root: string,
): Promise<void> {
  await window.axon.writeTextFile(path, content, root);
}

export async function createFile(path: string, root?: string): Promise<void> {
  await request("/fs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, is_dir: false, root: workspaceRootFor(path, root) }),
  });
}

export async function createDir(path: string, root?: string): Promise<void> {
  await request("/fs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, is_dir: true, root: workspaceRootFor(path, root) }),
  });
}

export async function deleteEntry(path: string, root: string): Promise<void> {
  await request(
    `/fs/delete?path=${encodeURIComponent(path)}&root=${encodeURIComponent(root)}`,
    {
      method: "DELETE",
    },
  );
}

export async function moveEntry(
  source: string,
  targetDir: string,
  root?: string,
): Promise<void> {
  await request("/fs/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      target_dir: targetDir,
      root: workspaceRootFor(source, root),
    }),
  });
}

export async function renameEntry(
  source: string,
  newName: string,
  root?: string,
): Promise<string> {
  const data = await request<{ path: string }>("/fs/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      new_name: newName,
      root: workspaceRootFor(source, root),
    }),
  });

  return data.path;
}

export async function searchWorkspace(
  root: string,
  query: string,
  signal?: AbortSignal,
): Promise<WorkspaceSearchResult[]> {
  activeWorkspaceRoot = root;
  return request<WorkspaceSearchResult[]>(
    `/fs/search?root=${encodeURIComponent(root)}&q=${encodeURIComponent(query)}`,
    { signal },
  );
}

export async function replaceWorkspace(
  root: string,
  search: string,
  replacement: string,
): Promise<WorkspaceReplaceResult> {
  return request<WorkspaceReplaceResult>("/fs/replace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root, search, replacement }),
  });
}
