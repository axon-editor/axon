import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";
import path from "path";
import {
  type HtmlPreviewConsoleEvent,
  type HtmlPreviewTarget,
} from "../../shared/htmlPreview";
import { injectHtmlPreviewClient } from "./inject";

type WatchOptions = NonNullable<Parameters<typeof chokidar.watch>[1]>;

interface HtmlPreviewServerDependencies {
  buildWatcherOptions: () => WatchOptions;
  shouldIgnoreWorkspaceWatchPath: (candidatePath: string) => boolean;
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

export class HtmlPreviewServer {
  private server: Server | null = null;
  private rootPath: string | null = null;
  private serverId: string | null = null;
  private baseUrl: string | null = null;
  private watcher: FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly clients = new Set<ServerResponse>();

  constructor(private readonly deps: HtmlPreviewServerDependencies) {}

  async getTarget(
    filePath: string,
    folderPath?: string | null,
  ): Promise<HtmlPreviewTarget> {
    const resolvedFilePath = path.resolve(filePath);
    const rootPath = this.resolveRoot(resolvedFilePath, folderPath);

    if (!fs.existsSync(resolvedFilePath)) {
      throw new Error("HTML file does not exist.");
    }

    await this.ensureServer(rootPath);

    if (!this.baseUrl || !this.serverId || !this.rootPath) {
      throw new Error("HTML preview server did not start.");
    }

    const relativePath = path
      .relative(this.rootPath, resolvedFilePath)
      .split(path.sep)
      .map(encodeURIComponent)
      .join("/");

    return {
      filePath: resolvedFilePath,
      rootPath: this.rootPath,
      serverId: this.serverId,
      url: `${this.baseUrl}/${relativePath}`,
    };
  }

  async close() {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.server) {
      const serverToClose = this.server;
      await new Promise<void>((resolve) => serverToClose.close(() => resolve()));
      this.server = null;
    }

    this.rootPath = null;
    this.serverId = null;
    this.baseUrl = null;
  }

  private normalizeRoot(rootPath: string) {
    return path.resolve(rootPath);
  }

  private isPathInsideRoot(candidatePath: string, rootPath: string) {
    const relativePath = path.relative(rootPath, candidatePath);
    return (
      relativePath === "" ||
      (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  }

  private resolveRoot(filePath: string, folderPath?: string | null) {
    const resolvedFilePath = path.resolve(filePath);
    if (folderPath) {
      const workspaceRoot = this.normalizeRoot(folderPath);
      if (this.isPathInsideRoot(resolvedFilePath, workspaceRoot)) {
        return workspaceRoot;
      }
    }

    return path.dirname(resolvedFilePath);
  }

  private getContentType(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".htm": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
      ".wasm": "application/wasm",
    };

    return types[extension] ?? "application/octet-stream";
  }

  private writeJson(
    response: ServerResponse,
    statusCode: number,
    body: unknown,
  ) {
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(body));
  }

  private collectRequestBody(request: IncomingMessage) {
    return new Promise<string>((resolve, reject) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1024 * 1024) {
          reject(new Error("Preview console payload is too large."));
        }
      });
      request.on("end", () => resolve(body));
      request.on("error", reject);
    });
  }

  private async handleConsoleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    try {
      const rawBody = await this.collectRequestBody(request);
      const payload = JSON.parse(rawBody || "{}") as Partial<HtmlPreviewConsoleEvent>;
      const event: HtmlPreviewConsoleEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        serverId:
          typeof payload.serverId === "string"
            ? payload.serverId
            : (this.serverId ?? "preview"),
        level:
          payload.level === "log" ||
          payload.level === "info" ||
          payload.level === "warn" ||
          payload.level === "error"
            ? payload.level
            : "log",
        message:
          typeof payload.message === "string" ? payload.message : String(payload),
        source: typeof payload.source === "string" ? payload.source : undefined,
        line: typeof payload.line === "number" ? payload.line : undefined,
        column: typeof payload.column === "number" ? payload.column : undefined,
        timestamp: Date.now(),
      };

      this.deps.sendToRenderer("htmlPreview:console", event);
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
    } catch (err) {
      this.writeJson(response, 400, {
        error: err instanceof Error ? err.message : "Invalid console payload.",
      });
    }
  }

  private handleEventStream(response: ServerResponse) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    response.write("\n");
    this.clients.add(response);
    response.on("close", () => this.clients.delete(response));
  }

  private broadcastReload(changedPath: string) {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);

    this.reloadTimer = setTimeout(() => {
      const payload = JSON.stringify({ path: changedPath, timestamp: Date.now() });
      for (const client of this.clients) {
        if (client.destroyed) {
          this.clients.delete(client);
          continue;
        }
        client.write(`data: ${payload}\n\n`);
      }
      this.deps.sendToRenderer("htmlPreview:changed", {
        path: changedPath,
        serverId: this.serverId,
      });
    }, 100);
  }

  private async serveFile(
    response: ServerResponse,
    requestUrl: URL,
  ) {
    if (!this.rootPath || !this.serverId) {
      this.writeJson(response, 503, { error: "Preview server is not ready." });
      return;
    }

    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const normalizedRequestPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const requestedPath = path.resolve(this.rootPath, `.${normalizedRequestPath}`);

    // The preview server behaves like a tiny browser server, but it must never
    // become a general filesystem reader. Every request is resolved relative to
    // the active workspace root and rejected if path normalization would escape
    // that root through "../" traversal.
    if (!this.isPathInsideRoot(requestedPath, this.rootPath)) {
      this.writeJson(response, 403, {
        error: "Preview path is outside workspace.",
      });
      return;
    }

    try {
      const stat = await fs.promises.stat(requestedPath);
      const filePath = stat.isDirectory()
        ? path.join(requestedPath, "index.html")
        : requestedPath;
      const contentType = this.getContentType(filePath);
      const rawBuffer = await fs.promises.readFile(filePath);

      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });

      if (contentType.startsWith("text/html")) {
        response.end(
          injectHtmlPreviewClient(rawBuffer.toString("utf8"), this.serverId),
        );
        return;
      }

      response.end(rawBuffer);
    } catch {
      this.writeJson(response, 404, { error: "Preview file was not found." });
    }
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const host = request.headers.host ?? "127.0.0.1";
    const requestUrl = new URL(request.url ?? "/", `http://${host}`);

    if (requestUrl.pathname === "/__axon_preview/events") {
      this.handleEventStream(response);
      return;
    }

    if (requestUrl.pathname === "/__axon_preview/console") {
      await this.handleConsoleRequest(request, response);
      return;
    }

    await this.serveFile(response, requestUrl);
  }

  private async ensureServer(rootPath: string) {
    const normalizedRoot = this.normalizeRoot(rootPath);
    if (this.server && this.rootPath === normalizedRoot) return;

    await this.close();

    this.rootPath = normalizedRoot;
    this.serverId = `preview-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      await this.close();
      throw new Error("Could not bind the HTML preview server.");
    }

    this.baseUrl = `http://127.0.0.1:${address.port}`;
    this.watcher = chokidar.watch(normalizedRoot, {
      ...this.deps.buildWatcherOptions(),
      ignored: this.deps.shouldIgnoreWorkspaceWatchPath,
      depth: 8,
    });

    const notifyReload = (changedPath: string) => {
      this.broadcastReload(changedPath);
    };

    this.watcher.on("change", notifyReload);
    this.watcher.on("add", notifyReload);
    this.watcher.on("unlink", notifyReload);
  }
}
