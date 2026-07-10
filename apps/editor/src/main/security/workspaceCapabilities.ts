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
    fs.writeFileSync(this.storagePath, JSON.stringify({ roots }, null, 2), "utf8");
  }

  authorize(rendererId: number, rootPath: string, persist = false) {
    const root = canonicalWorkspacePath(rootPath);
    const info = fs.statSync(root);
    if (!info.isDirectory()) throw new Error("Workspace capability must be a directory.");

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
      throw new Error("Renderer does not hold a capability for this workspace root.");
    }
    return root;
  }

  assertPath(rendererId: number, candidatePath: string) {
    const candidate = canonicalWorkspacePath(candidatePath);
    const roots = this.rootsByRenderer.get(rendererId);
    if (!roots || ![...roots].some((root) => pathInsideWorkspaceRoot(candidate, root))) {
      throw new Error("Path is outside the renderer's approved workspaces.");
    }
    return candidate;
  }

  releaseRenderer(rendererId: number) {
    this.rootsByRenderer.delete(rendererId);
  }
}

export function registerWorkspaceCapabilityHandlers(
  registry: WorkspaceCapabilityRegistry,
) {
  ipcMain.handle("workspace:authorizeKnownRoot", (event, rootPath: string) =>
    registry.authorizeKnown(event.sender.id, rootPath),
  );

  ipcMain.handle(
    "workspace:readTextFile",
    async (event, filePath: string, rootPath: string) => {
      registry.assertRoot(event.sender.id, rootPath);
      const authorizedPath = registry.assertPath(event.sender.id, filePath);
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
      if (text.includes("\uFFFD") && !Buffer.from(text, "utf8").equals(content)) {
        throw new Error("This file is not valid UTF-8 text.");
      }
      return { path: authorizedPath, content: text };
    },
  );

  ipcMain.handle(
    "workspace:writeTextFile",
    async (event, filePath: string, content: string, rootPath: string) => {
      if (typeof content !== "string") throw new Error("File content must be text.");
      if (Buffer.byteLength(content, "utf8") > 32 * 1024 * 1024) {
        throw new Error("File is too large to save through the text editor.");
      }
      registry.assertRoot(event.sender.id, rootPath);
      const authorizedPath = registry.assertPath(event.sender.id, filePath);
      await fs.promises.writeFile(authorizedPath, content, "utf8");
    },
  );
}
