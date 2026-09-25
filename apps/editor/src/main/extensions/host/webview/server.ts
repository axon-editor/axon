/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from "crypto";
import fs from "fs";
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";
import path from "path";
import { type ExtensionWebviewTarget } from "../../../../shared/extensionWebview";
import { type HtmlPreviewConsoleEvent } from "../../../../shared/htmlPreview";
import { authorizeHtmlPreviewRequest } from "../../../htmlPreview/server";
import { getHtmlPreviewContentType } from "../../../htmlPreview/server";
import { injectHtmlPreviewClient } from "../../../htmlPreview/inject";

interface ExtensionWebviewServerDependencies {
  sendToRenderer: (channel: string, payload?: unknown) => void;
}

// An extension webview is the content its package ships in a `webview/` folder.
// The editor renders it as a tab in the same sandboxed iframe pattern used by
// HTML preview, and this server is the only process that reads those files.
// Requests are authorization-gated with the same access-token/cookie scheme as
// the preview server, so an arbitrary localhost client cannot read extension
// assets, and path resolution never escapes the package's own webview folder.
export class ExtensionWebviewServer {
  private server: Server | null = null;
  private rootPath: string | null = null;
  private serverId: string | null = null;
  private baseUrl: string | null = null;
  private accessToken: string | null = null;
  private readonly clients = new Set<ServerResponse>();

  constructor(private readonly deps: ExtensionWebviewServerDependencies) {}

  async getTarget(
    extensionId: string,
    extensionPath: string,
  ): Promise<ExtensionWebviewTarget> {
    const webviewRoot = path.resolve(extensionPath, "webview");
    if (!fs.existsSync(webviewRoot) || !fs.statSync(webviewRoot).isDirectory()) {
      throw new Error(
        `Extension "${extensionId}" does not ship a webview folder.`,
      );
    }

    await this.ensureServer(webviewRoot);

    if (!this.baseUrl || !this.serverId || !this.accessToken) {
      throw new Error("Extension webview server did not start.");
    }

    return {
      extensionId,
      rootPath: webviewRoot,
      serverId: this.serverId,
      url: `${this.baseUrl}/${this.accessToken}/index.html`,
    };
  }

  async close() {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    if (this.server) {
      const serverToClose = this.server;
      await new Promise<void>((resolve) => serverToClose.close(() => resolve()));
      this.server = null;
    }

    this.rootPath = null;
    this.serverId = null;
    this.baseUrl = null;
    this.accessToken = null;
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
          reject(new Error("Webview console payload is too large."));
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
            : (this.serverId ?? "extension-webview"),
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
    } catch {
      this.writeJson(response, 400, {
        error: "Invalid webview console payload.",
      });
    }
  }

  private handleEventStream(response: ServerResponse) {
    // The injected preview client opens this stream so reload events can be
    // broadcast. Extension webview assets ship inside their installed package
    // and are not written on disk while the tab is open, so nothing ever sends.
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    response.write("\n");
    this.clients.add(response);
    response.on("close", () => this.clients.delete(response));
  }

  private async serveFile(response: ServerResponse, requestUrl: URL) {
    if (!this.rootPath) {
      this.writeJson(response, 503, { error: "Webview server is not ready." });
      return;
    }

    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const normalizedRequestPath = decodedPath === "/" ? "/index.html" : decodedPath;
    const requestedPath = path.resolve(this.rootPath, `.${normalizedRequestPath}`);

    // Extension packages live in the user data folder, not the workspace, so
    // the traversal guard has to be absolute. A request can only ever reach
    // files inside the extension's own webview folder.
    const relativePath = path.relative(this.rootPath, requestedPath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      this.writeJson(response, 403, {
        error: "Webview path is outside the package.",
      });
      return;
    }

    try {
      const stat = await fs.promises.stat(requestedPath);
      const filePath = stat.isDirectory()
        ? path.join(requestedPath, "index.html")
        : requestedPath;
      const contentType = getHtmlPreviewContentType(filePath);
      const rawBuffer = await fs.promises.readFile(filePath);

      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });

      if (contentType.startsWith("text/html")) {
        response.end(
          injectHtmlPreviewClient(
            rawBuffer.toString("utf8"),
            this.serverId ?? "extension-webview",
            `/${this.accessToken}`,
          ),
        );
        return;
      }

      response.end(rawBuffer);
    } catch {
      this.writeJson(response, 404, { error: "Webview file was not found." });
    }
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const host = request.headers.host ?? "127.0.0.1";
    const requestUrl = new URL(request.url ?? "/", `http://${host}`);
    if (!this.accessToken || !this.serverId) {
      this.writeJson(response, 503, { error: "Webview server is not ready." });
      return;
    }
    const authorization = authorizeHtmlPreviewRequest({
      accessToken: this.accessToken,
      cookieHeader: request.headers.cookie,
      pathname: requestUrl.pathname,
      serverId: this.serverId,
    });
    if (!authorization.authorized) {
      this.writeJson(response, 404, { error: "Webview target was not found." });
      return;
    }
    requestUrl.pathname = authorization.pathname;
    if (authorization.setCookie) {
      response.setHeader("Set-Cookie", authorization.setCookie);
    }

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

  private async ensureServer(webviewRoot: string) {
    const normalizedRoot = path.resolve(webviewRoot);
    if (this.server && this.rootPath === normalizedRoot) return;

    await this.close();

    this.rootPath = normalizedRoot;
    this.serverId = `webview-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    this.accessToken = randomBytes(24).toString("base64url");
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
      throw new Error("Could not bind the extension webview server.");
    }

    this.baseUrl = `http://127.0.0.1:${address.port}`;
  }
}