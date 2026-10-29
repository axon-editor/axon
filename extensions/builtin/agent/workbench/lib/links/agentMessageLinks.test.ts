/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { resolveAgentMessageLink } from "./agentMessageLinks";

const WORKSPACE = "/workspace";

describe("resolveAgentMessageLink", () => {
  it("opens dev server file links in the workspace", () => {
    expect(
      resolveAgentMessageLink(
        "http://127.0.0.1:5173/packages/extension-api/README.md",
        WORKSPACE,
      ),
    ).toEqual({
      kind: "file",
      path: "/workspace/packages/extension-api/README.md",
    });

    expect(
      resolveAgentMessageLink(
        "http://localhost:5173/packages/extension-api/README.md#install",
        WORKSPACE,
      ),
    ).toEqual({
      kind: "file",
      path: "/workspace/packages/extension-api/README.md",
    });
  });

  it("resolves relative, root-relative, and file URL links", () => {
    expect(
      resolveAgentMessageLink("packages/extension-api/README.md", WORKSPACE),
    ).toEqual({
      kind: "file",
      path: "/workspace/packages/extension-api/README.md",
    });

    expect(
      resolveAgentMessageLink("/packages/extension-api/README.md", WORKSPACE),
    ).toEqual({
      kind: "file",
      path: "/workspace/packages/extension-api/README.md",
    });

    expect(
      resolveAgentMessageLink(
        "file:///workspace/packages/extension-api/README.md",
        WORKSPACE,
      ),
    ).toEqual({
      kind: "file",
      path: "/workspace/packages/extension-api/README.md",
    });
  });

  it("keeps external links external", () => {
    expect(
      resolveAgentMessageLink("https://example.com/axon", WORKSPACE),
    ).toEqual({ kind: "external", href: "https://example.com/axon" });
    expect(
      resolveAgentMessageLink("mailto:hello@example.com", WORKSPACE),
    ).toEqual({ kind: "external", href: "mailto:hello@example.com" });
    expect(resolveAgentMessageLink("tel:+15555550100", WORKSPACE)).toEqual({
      kind: "external",
      href: "tel:+15555550100",
    });
  });

  it("recognizes in-page anchors", () => {
    expect(resolveAgentMessageLink("#install", WORKSPACE)).toEqual({
      kind: "anchor",
      id: "install",
    });
  });

  it("rejects paths that escape the workspace", () => {
    expect(resolveAgentMessageLink("../outside.md", WORKSPACE)).toBeNull();
    expect(
      resolveAgentMessageLink(
        "http://127.0.0.1:5173/%2e%2e/outside.md",
        WORKSPACE,
      ),
    ).toBeNull();
    expect(
      resolveAgentMessageLink("file:///outside/README.md", WORKSPACE),
    ).toBeNull();
  });

  it("does not treat unsupported schemes as workspace files", () => {
    expect(resolveAgentMessageLink("data:text/plain,hello", WORKSPACE)).toBeNull();
    expect(resolveAgentMessageLink("axon://local/ticket", WORKSPACE)).toBeNull();
  });
});
