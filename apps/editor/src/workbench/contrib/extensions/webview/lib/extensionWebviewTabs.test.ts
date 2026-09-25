/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import {
  createExtensionWebviewTabPath,
  getExtensionWebviewExtensionId,
  getExtensionWebviewTabLabel,
  isExtensionWebviewTabPath,
} from "./extensionWebviewTabs";

describe("extension webview tab helpers", () => {
  it("wraps an extension id in a stable virtual tab path", () => {
    const tabPath = createExtensionWebviewTabPath("axon.snake");
    expect(tabPath).toBe("axon-extension-webview:axon.snake");
    expect(isExtensionWebviewTabPath(tabPath)).toBe(true);
    expect(getExtensionWebviewExtensionId(tabPath)).toBe("axon.snake");
  });

  it("round-trips extension ids through URL encoding", () => {
    const extensionId = "axon.snake@v2";
    const tabPath = createExtensionWebviewTabPath(extensionId);
    expect(getExtensionWebviewExtensionId(tabPath)).toBe(extensionId);
  });

  it("does not mistake file paths for webview tabs", () => {
    expect(isExtensionWebviewTabPath("/home/axon/index.html")).toBe(false);
    expect(isExtensionWebviewTabPath("axon-html-preview:webview")).toBe(false);
    expect(getExtensionWebviewExtensionId("/home/index.html")).toBeNull();
  });

  it("derives a readable tab label from the extension id", () => {
    expect(
      getExtensionWebviewTabLabel(createExtensionWebviewTabPath("axon.snake")),
    ).toBe("Snake");
    expect(
      getExtensionWebviewTabLabel(createExtensionWebviewTabPath("game.snake")),
    ).toBe("Snake");
    expect(
      getExtensionWebviewTabLabel(
        createExtensionWebviewTabPath("axon-extension-webview"),
      ),
    ).toBe("Axon-extension-webview");
  });

  it("keeps a malformed tab path decodable", () => {
    const tabPath = "axon-extension-webview:%E0%A4%A";
    const extensionId = getExtensionWebviewExtensionId(tabPath);
    expect(extensionId).not.toBeNull();
    expect(extensionId?.length ?? 0).toBeGreaterThan(0);
    expect(getExtensionWebviewTabLabel(tabPath).length).toBeGreaterThan(0);
  });
});