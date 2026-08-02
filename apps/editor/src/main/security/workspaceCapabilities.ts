import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import {
  canonicalWorkspacePath,
  pathInsideWorkspaceRoot,
} from "./workspacePathPolicy";

interface StoredCapabilities {
  roots: string[];
}

export class WorkspaceCapabilityRegistry {
  private readonly rootsByRenderer = new Map<number, Set<string>>();
  private readonly readOnlyFilesByRenderer = new Map<number, Set<string>>();
  private readonly writableFilesByRenderer = new Map<number, Set<string>>();
  private approvedRoots: Set<string> | null = null;

  private get storagePath() {
    return path.join(app.getPath("userData"), "workspace-capabilities.json");
  }

  private loadApprovedRoots() {
    if (this.approvedRoots) return this.approvedRoots;
    try {
      const parsed = JSON.parse(
        fs.readFileSync(this.storagePath, "utf8"),
      ) as StoredCapabilities;
      this.approvedRoots = new Set(
        Array.isArray(parsed.roots)
          ? parsed.roots
              .filter((root): root is string => typeof root === "string")
              .map(canonicalWorkspacePath)
          : [],
      );
    } catch {
      this.approvedRoots = new Set();
    }
    return this.approvedRoots;
  }

  private persistApprovedRoots() {
    const roots = [...this.loadApprovedRoots()].sort();
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(
      this.storagePath,
      JSON.stringify({ roots }, null, 2),
      "utf8",
    );
  }

  authorize(rendererId: number, rootPath: string, persist = false) {
    const root = canonicalWorkspacePath(rootPath);
    const info = fs.statSync(root);
    if (!info.isDirectory())
      throw new Error("Workspace capability must be a directory.");

    let rendererRoots = this.rootsByRenderer.get(rendererId);
    if (!rendererRoots) {
      rendererRoots = new Set();
      this.rootsByRenderer.set(rendererId, rendererRoots);
    }
    rendererRoots.add(root);
    if (persist && !this.loadApprovedRoots().has(root)) {
      this.loadApprovedRoots().add(root);
      this.persistApprovedRoots();
    }
    return root;
  }

  authorizeKnown(rendererId: number, rootPath: string) {
    const root = canonicalWorkspacePath(rootPath);
    if (!this.loadApprovedRoots().has(root)) {
      throw new Error(
        "This workspace has not been approved by Axon. Open it with the native folder picker first.",
      );
    }
    return this.authorize(rendererId, root);
  }

  assertRoot(rendererId: number, rootPath: string) {
    const root = canonicalWorkspacePath(rootPath);
    if (!this.rootsByRenderer.get(rendererId)?.has(root)) {
      throw new Error(
        "Renderer does not hold a capability for this workspace root.",
      );
    }
    return root;
  }

  assertPath(rendererId: number, candidatePath: string) {
    const candidate = canonicalWorkspacePath(candidatePath);
    const roots = this.rootsByRenderer.get(rendererId);
    if (
      !roots ||
      ![...roots].some((root) => pathInsideWorkspaceRoot(candidate, root))
    ) {
      throw new Error("Path is outside the renderer's approved workspaces.");
    }
    return candidate;
  }

  authorizeReadOnlyFile(rendererId: number, filePath: string) {
    const candidate = canonicalWorkspacePath(filePath);
    if (this.writableFilesByRenderer.get(rendererId)?.has(candidate)) {
      return candidate;
    }
    let files = this.readOnlyFilesByRenderer.get(rendererId);
    if (!files) {
      files = new Set();
      this.readOnlyFilesByRenderer.set(rendererId, files);
    }
    files.add(candidate);
    return candidate;
  }

  authorizeFile(rendererId: number, filePath: string) {
    const candidate = canonicalWorkspacePath(filePath);
    this.readOnlyFilesByRenderer.get(rendererId)?.delete(candidate);
    let files = this.writableFilesByRenderer.get(rendererId);
    if (!files) {
      files = new Set();
      this.writableFilesByRenderer.set(rendererId, files);
    }
    files.add(candidate);
    return candidate;
  }

  assertReadablePath(rendererId: number, candidatePath: string) {
    const candidate = canonicalWorkspacePath(candidatePath);
    const roots = this.rootsByRenderer.get(rendererId);
    if (
      roots &&
      [...roots].some((root) => pathInsideWorkspaceRoot(candidate, root))
    ) {
      return candidate;
    }

    // Language servers can return standard-library or dependency definitions
    // outside the workspace. Those files are granted individually, never as a
    // parent directory, so navigation can read the exact definition without
    // turning an LSP result into broad filesystem access or write permission.
    if (this.readOnlyFilesByRenderer.get(rendererId)?.has(candidate)) {
      return candidate;
    }
    if (this.writableFilesByRenderer.get(rendererId)?.has(candidate)) {
      return candidate;
    }

    throw new Error(
      "This file is outside the active workspace and was not provided by a language tool.",
    );
  }

  isReadOnlyFile(rendererId: number, candidatePath: string) {
    const candidate = canonicalWorkspacePath(candidatePath);
    const roots = this.rootsByRenderer.get(rendererId);
    const insideWorkspace =
      roots &&
      [...roots].some((root) => pathInsideWorkspaceRoot(candidate, root));
    return (
      !insideWorkspace &&
      this.readOnlyFilesByRenderer.get(rendererId)?.has(candidate) === true
    );
  }

  isExternalFile(rendererId: number, candidatePath: string) {
    const candidate = canonicalWorkspacePath(candidatePath);
    const roots = this.rootsByRenderer.get(rendererId);
    return !(
      roots &&
      [...roots].some((root) => pathInsideWorkspaceRoot(candidate, root))
    );
  }

  assertWritablePath(rendererId: number, candidatePath: string) {
    const candidate = canonicalWorkspacePath(candidatePath);
    const roots = this.rootsByRenderer.get(rendererId);
    if (
      roots &&
      [...roots].some((root) => pathInsideWorkspaceRoot(candidate, root))
    ) {
      return candidate;
    }
    if (this.writableFilesByRenderer.get(rendererId)?.has(candidate)) {
      return candidate;
    }
    throw new Error("This file is read-only or outside the active workspace.");
  }

  releaseRenderer(rendererId: number) {
    this.rootsByRenderer.delete(rendererId);
    this.readOnlyFilesByRenderer.delete(rendererId);
    this.writableFilesByRenderer.delete(rendererId);
  }
}

export function registerWorkspaceCapabilityHandlers(
  registry: WorkspaceCapabilityRegistry,
) {
  ipcMain.handle("workspace:authorizeKnownRoot", (event, rootPath: string) =>
    registry.authorizeKnown(event.sender.id, rootPath),
  );

  ipcMain.handle(
    "workspace:authorizeDroppedFiles",
    async (event, filePaths: string[], rootPath?: string | null) => {
      if (rootPath) registry.assertRoot(event.sender.id, rootPath);
      if (!Array.isArray(filePaths) || filePaths.length > 128) {
        throw new Error("Too many files were dropped at once.");
      }

      const authorizedFiles: string[] = [];
      for (const filePath of filePaths) {
        if (typeof filePath !== "string" || filePath.length === 0) continue;
        const canonicalPath = canonicalWorkspacePath(filePath);
        const info = await fs.promises.stat(canonicalPath);
        if (!info.isFile()) continue;

        // A native file drop is an explicit user selection, but it should not
        // silently convert the file's parent directory into a workspace. I
        // grant only each concrete file so the editor can open and save it
        // while folder browsing remains behind its normal workspace capability.
        registry.authorizeFile(event.sender.id, canonicalPath);
        authorizedFiles.push(canonicalPath);
      }
      return authorizedFiles;
    },
  );

  ipcMain.handle(
    "workspace:readTextFile",
    async (event, filePath: string, _rootPath: string) => {
      const authorizedPath = registry.assertReadablePath(
        event.sender.id,
        filePath,
      );
      const info = await fs.promises.stat(authorizedPath);
      if (!info.isFile()) throw new Error("Path is not a file.");
      if (info.size > 32 * 1024 * 1024) {
        throw new Error("File is too large to open in the text editor.");
      }

      const content = await fs.promises.readFile(authorizedPath);
      const sample = content.subarray(0, Math.min(content.length, 8192));
      if (sample.includes(0)) {
        throw new Error("This file is binary and cannot be opened as text.");
      }
      const text = content.toString("utf8");
      if (
        text.includes("\uFFFD") &&
        !Buffer.from(text, "utf8").equals(content)
      ) {
        throw new Error("This file is not valid UTF-8 text.");
      }
      return {
        path: authorizedPath,
        content: text,
        readOnly: registry.isReadOnlyFile(event.sender.id, authorizedPath),
        external: registry.isExternalFile(event.sender.id, authorizedPath),
      };
    },
  );

  ipcMain.handle(
    "workspace:writeTextFile",
    async (event, filePath: string, content: string, _rootPath: string) => {
      if (typeof content !== "string")
        throw new Error("File content must be text.");
      if (Buffer.byteLength(content, "utf8") > 32 * 1024 * 1024) {
        throw new Error("File is too large to save through the text editor.");
      }
      const authorizedPath = registry.assertWritablePath(
        event.sender.id,
        filePath,
      );
      await fs.promises.writeFile(authorizedPath, content, "utf8");
    },
  );
}
