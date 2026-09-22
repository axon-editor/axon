/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import MarkdownPreview from "@axon-builtin-markdown/MarkdownPreview";
import MarkdownPreviewTab from "@axon-builtin-markdown/MarkdownPreviewTab";
import { publishMarkdownScroll } from "@axon-builtin-markdown/lib/sync/scrollSync";

const mermaidMock = vi.hoisted(() => ({
  bindFunctions: vi.fn(),
  initialize: vi.fn(),
  render: vi.fn(),
}));
const monacoMock = vi.hoisted(() => ({
  colorize: vi.fn(),
}));
const bridgeMock = vi.hoisted(() => ({
  copyText: vi.fn(),
  getLocalAssetUrl: vi.fn(),
  openExternalLink: vi.fn(),
  saveMarkdownPdf: vi.fn(),
}));
const markdownFileMock = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("@axon-editor/renderer/shared/lib/api", () => ({
  readFile: markdownFileMock.readFile,
}));

vi.mock(
  "@axon-editor/renderer/features/editor/lib/buffer/monacoModels",
  () => ({
    getModel: () => null,
    onModelReady: () => ({ dispose() {} }),
  }),
);

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidMock.initialize,
    render: mermaidMock.render,
  },
}));

vi.mock("monaco-editor", () => ({
  editor: { colorize: monacoMock.colorize },
}));

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

// The preview debounces the parse-render-morphdom cycle by 120ms to avoid
// blocking the main thread on fast typing. Tests must flush that timer
// before asserting on the rendered DOM.
async function flushPreview(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
}

describe("MarkdownPreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    mermaidMock.bindFunctions.mockReset();
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({
      svg: '<svg data-testid="rendered-mermaid" viewBox="0 0 100 50"></svg>',
      bindFunctions: mermaidMock.bindFunctions,
    });
    monacoMock.colorize.mockReset();
    monacoMock.colorize.mockResolvedValue(
      '<span style="color:#ff0000">const</span> answer = 42;',
    );
    bridgeMock.copyText.mockReset();
    bridgeMock.getLocalAssetUrl.mockReset();
    bridgeMock.getLocalAssetUrl.mockResolvedValue(
      "axon://local/test-preview-ticket",
    );
    bridgeMock.openExternalLink.mockReset();
    bridgeMock.saveMarkdownPdf.mockReset();
    bridgeMock.saveMarkdownPdf.mockResolvedValue("/tmp/README.pdf");
    markdownFileMock.readFile.mockReset();
    markdownFileMock.readFile.mockResolvedValue({
      content: "![Preview](./preview.png)\n\nStable document",
    });
    Object.defineProperty(window, "axon", {
      configurable: true,
      value: bridgeMock,
    });
    Object.defineProperty(window, "print", {
      configurable: true,
      value: vi.fn(),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.style.removeProperty("--axon-editor-background");
    document.documentElement.style.removeProperty("--axon-editor-foreground");
    document.documentElement.style.removeProperty("--axon-panel-background");
    document.documentElement.style.removeProperty("--axon-panel-border");
    document.documentElement.style.removeProperty("--axon-syntax-function");
  });

  it("keeps rendered media mounted while nearby content changes", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"![Preview](./preview.png)\n\nFirst version"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    const initialImage = container.querySelector("img");
    expect(initialImage).not.toBeNull();

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"![Preview](./preview.png)\n\nSecond version"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(container.querySelector("img")).toBe(initialImage);
    expect(container.textContent).toContain("Second version");
  });

  it("does not repaint a preview during an unrelated workbench heartbeat", async () => {
    const onOpenFile = vi.fn();
    const preview = (
      <MarkdownPreviewTab
        filePath="/workspace/README.md"
        folderPath="/workspace"
        onOpenFile={onOpenFile}
      />
    );

    await act(async () => {
      root.render(preview);
    });
    await flushPreview();

    const initialImage = container.querySelector("img");
    expect(initialImage).not.toBeNull();

    // Git polling rerenders Axon's workbench with the same Markdown inputs.
    // The browser node is the useful regression signal: if the preview subtree
    // remounts, images and videos visibly blink even though their URLs and the
    // document content never changed.
    await act(async () => {
      root.render(preview);
    });
    await flushPreview();

    expect(markdownFileMock.readFile).toHaveBeenCalledOnce();
    expect(container.querySelector("img")).toBe(initialImage);
  });

  it("keeps Mermaid fences as plain code without executing diagrams", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"```mermaid\nflowchart LR\n  A --> B\n```"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(
      container.querySelector("pre code")?.textContent,
    ).toContain("flowchart LR");
    expect(mermaidMock.initialize).not.toHaveBeenCalled();
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it("renders code fences as plain text before highlighting is applied", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"```ts\nconst answer = 42;\n```"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(container.querySelector("pre code")?.textContent).toBe(
      "const answer = 42;",
    );
    expect(monacoMock.colorize).not.toHaveBeenCalled();
  });

  it("renders callouts, math, and footnotes while concealing YAML frontmatter", async () => {
    const content = `---
title: Markdown reference
tags: [axon, docs]
---

> [!WARNING]
> Check the invariant.

Inline $x^2$ and block math:

$$
x = \\frac{-b}{2a}
$$

A footnote.[^1]

[^1]: Footnote content.`;

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={content}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(container.querySelector('[data-callout="warning"]')).not.toBeNull();
    expect(container.querySelector(".math-inline")?.textContent).toContain(
      "$x^2$",
    );
    expect(container.querySelector(".footnote-ref")).not.toBeNull();
    expect(container.textContent).toContain("Footnotes");
    expect(container.textContent).toContain("Footnote content");
    expect(container.textContent).not.toContain("Markdown reference");
  });

  it("removes privileged raw HTML and unsafe navigation protocols", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={
            '<iframe src="https://example.com"></iframe><script>alert(1)</script><a href="data:text/html,unsafe">unsafe</a>'
          }
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    const unsafeAnchor = container.querySelector("a");
    expect(unsafeAnchor).not.toBeNull();
    expect(unsafeAnchor?.getAttribute("href")).toBeNull();
  });

  it("resolves wiki links and citations", async () => {
    const content = `---
references:
  axon2026:
    title: Axon Architecture
    author: Gorden
    year: 2026
    url: https://example.com/axon
---

Read [[Architecture Guide|the guide]] and [@axon2026].`;

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={content}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(
      container.querySelector('a[data-target="Architecture Guide"]')
        ?.textContent,
    ).toContain("the guide");
    expect(
      container.querySelector('a[data-citation-id="axon2026"]'),
    ).not.toBeNull();
  });

  it("updates the exact source task and attaches source-line markers", async () => {
    const onContentChange = vi.fn();
    const content = "# Tasks\n\n- [ ] first\n- [x] second";
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={content}
          filePath="/workspace/README.md"
          folderPath="/workspace"
          onContentChange={onContentChange}
        />,
      );
    });
    await flushPreview();

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox).not.toBeNull();
    await act(async () => checkbox?.click());

    expect(onContentChange).toHaveBeenCalledWith(
      "# Tasks\n\n- [x] first\n- [x] second",
    );
    expect(container.querySelector('[data-source-line="3"]')).not.toBeNull();
  });

  it("moves the preview to the nearest source block published by Monaco", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"# First\n\nParagraph\n\n# Target"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    const target = container.querySelector<HTMLElement>(
      '[data-source-line="5"]',
    );
    const scroller = container.querySelector<HTMLElement>(".overflow-y-auto");
    expect(target).not.toBeNull();
    expect(scroller).not.toBeNull();
    Object.defineProperty(target!, "offsetTop", {
      configurable: true,
      value: 420,
    });

    await act(async () => {
      publishMarkdownScroll({
        filePath: "/workspace/README.md",
        line: 5,
        source: "editor",
      });
    });
    expect(scroller?.scrollTop).toBe(404);
  });

  it("provides print and explicit PDF export actions", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content="# Export me"
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Export Markdown as PDF"]',
        )
        ?.click();
    });
    expect(bridgeMock.saveMarkdownPdf).toHaveBeenCalledWith(
      "README.pdf",
      expect.stringContaining("Export me"),
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Print Markdown"]')
        ?.click();
    });
    expect(window.print).toHaveBeenCalled();
  });
});