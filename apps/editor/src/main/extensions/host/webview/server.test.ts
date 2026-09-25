/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ExtensionWebviewServer } from "./server";

const servers: ExtensionWebviewServer[] = [];

async function fetchText(url: string) {
  const response = await fetch(url);
  return { status: response.status, text: await response.text() };
}

function writePackageFixture(extensionId: string) {
  const extensionPath = fs.mkdtempSync(
    path.join(os.tmpdir(), `axon-webview-test-${extensionId}-`),
  );
  const webviewRoot = path.join(extensionPath, "webview");
  fs.mkdirSync(webviewRoot, { recursive: true });
  fs.writeFileSync(
    path.join(webviewRoot, "index.html"),
    "<!doctype html><html><head><title>Game</title></head><body><script src=\"game.js\"></script></body></html>",
  );
  fs.writeFileSync(
    path.join(webviewRoot, "game.js"),
    "console.log('hello');",
  );
  return { extensionPath, webviewRoot };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("extension webview server", () => {
  it("serves the packaged index.html with the preview client injected", async () => {
    const { extensionPath } = writePackageFixture("axon.snake");
    const server = new ExtensionWebviewServer({ sendToRenderer: () => {} });
    servers.push(server);

    const target = await server.getTarget("axon.snake", extensionPath);
    expect(target.extensionId).toBe("axon.snake");
    expect(target.url).toContain("/index.html");
    expect(target.rootPath.endsWith("webview")).toBe(true);

    const { status, text } = await fetchText(target.url);
    expect(status).toBe(200);
    expect(text).toContain("data-axon-html-preview");
    expect(text).toContain("<title>Game</title>");
  });

  it("serves nested package assets under the token path", async () => {
    const { extensionPath } = writePackageFixture("axon.snake");
    const server = new ExtensionWebviewServer({ sendToRenderer: () => {} });
    servers.push(server);

    const target = await server.getTarget("axon.snake", extensionPath);
    const assetUrl = target.url.replace("/index.html", "/game.js");
    const { status, text } = await fetchText(assetUrl);
    expect(status).toBe(200);
    expect(text).toContain("console.log");
  });

  it("rejects requests that have neither the token nor its cookie", async () => {
    const { extensionPath } = writePackageFixture("axon.snake");
    const server = new ExtensionWebviewServer({ sendToRenderer: () => {} });
    servers.push(server);

    const target = await server.getTarget("axon.snake", extensionPath);
    const baseUrl = target.url.slice(0, target.url.indexOf("/", "http://".length + 1));
    const { status } = await fetchText(`${baseUrl}/index.html`);
    expect(status).toBe(404);
  });

  it("blocks path traversal that would escape the webview folder", async () => {
    const { extensionPath } = writePackageFixture("axon.snake");
    const outsideFile = path.join(path.dirname(extensionPath), "secret.txt");
    fs.writeFileSync(outsideFile, "secret");
    const server = new ExtensionWebviewServer({ sendToRenderer: () => {} });
    servers.push(server);

    const target = await server.getTarget("axon.snake", extensionPath);
    // Raw "../" is collapsed by URL normalization long before the server sees
    // it, so the meaningful attack is the encoded form, which must be rejected
    // by the root guard instead of reading a file outside the package.
    const escapedUrl = target.url.replace(
      "/index.html",
      `/..%2F..%2F${encodeURIComponent(path.basename(outsideFile))}`,
    );
    const { status, text } = await fetchText(escapedUrl);
    expect(status).toBe(403);
    expect(text).not.toContain("secret");
  });

  it("responds 404 for files missing from the package", async () => {
    const { extensionPath } = writePackageFixture("axon.snake");
    const server = new ExtensionWebviewServer({ sendToRenderer: () => {} });
    servers.push(server);

    const target = await server.getTarget("axon.snake", extensionPath);
    const { status } = await fetchText(
      target.url.replace("/index.html", "/missing.webp"),
    );
    expect(status).toBe(404);
  });

  it("refuses to start when the package has no webview folder", async () => {
    const extensionPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "axon-webview-empty-"),
    );
    fs.writeFileSync(path.join(extensionPath, "axon.extension.json"), "{}");
    const server = new ExtensionWebviewServer({ sendToRenderer: () => {} });
    servers.push(server);

    await expect(server.getTarget("axon.static", extensionPath)).rejects.toThrow(
      "does not ship a webview folder",
    );
  });
});