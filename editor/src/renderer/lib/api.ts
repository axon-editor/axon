// Thin client for communicating with axon-core (Go backend).
// All requests go through here, centralizes the base URL and
// response envelope unwrapping so components never deal with raw fetch.
// Every method returns the `data` field from the response envelope,
// or throws an error with the `error` field from the envelope.

const BASE_URL = "http://localhost:7777";

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

// request is the internal helper that handles fetch + envelope unwrapping
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const json: AxonResponse<T> = await res.json();

  if (json.status !== "ok") {
    throw new Error(json.error ?? "unknown error from axon-core");
  }

  return json.data as T;
}

// getTree fetches the recursive file tree for the given root path
export async function getTree(path: string): Promise<FileNode> {
  return request<FileNode>(`/fs/tree?path=${encodeURIComponent(path)}`);
}

// readFile fetches the content of a file at the given path
export async function readFile(path: string): Promise<FileContent> {
  return request<FileContent>(`/fs/file?path=${encodeURIComponent(path)}`);
}

// writeFile saves content to a file at the given path
export async function writeFile(path: string, content: string): Promise<void> {
  await request("/fs/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
}

export async function createFile(path: string): Promise<void> {
  await request("/fs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, is_dir: false }),
  });
}

export async function createDir(path: string): Promise<void> {
  await request("/fs/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, is_dir: true }),
  });
}

export async function deleteEntry(path: string): Promise<void> {
  await request(`/fs/delete?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
}

export async function moveEntry(
  source: string,
  targetDir: string,
): Promise<void> {
  await request("/fs/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, target_dir: targetDir }),
  });
}

export async function renameEntry(
  source: string,
  newName: string,
): Promise<string> {
  const data = await request<{ path: string }>("/fs/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, new_name: newName }),
  });

  return data.path;
}
