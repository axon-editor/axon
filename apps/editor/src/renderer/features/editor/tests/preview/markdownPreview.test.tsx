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
import * as morphdomModule from "@axon-builtin-markdown/lib/sync/morphdom";

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
const monacoModelsMock = vi.hoisted(() => ({
  getModel: vi.fn(),
  onModelReady: vi.fn(),
}));

vi.mock("@axon-editor/renderer/shared/lib/api", () => ({
  readFile: markdownFileMock.readFile,
}));

vi.mock(
  "@axon-editor/renderer/features/editor/lib/buffer/monacoModels",
  () => ({
    getModel: monacoModelsMock.getModel,
    onModelReady: monacoModelsMock.onModelReady,
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

// The preview throttles the parse-render-morphdom cycle to at most one
// run per 120ms while content keeps arriving (max wait), with an
// immediate render on the first edit after an idle gap. Tests must flush
// that timer before asserting on the rendered DOM.
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
    monacoModelsMock.getModel.mockReset();
    monacoModelsMock.getModel.mockReturnValue(null);
    monacoModelsMock.onModelReady.mockReset();
    monacoModelsMock.onModelReady.mockReturnValue({ dispose() {} });
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
    // The ticket resolves asynchronously and needs a second debounce cycle
    // to morph the real axon://local URL onto the existing media node.
    await flushPreview();

    const initialImage = container.querySelector("img");
    expect(initialImage).not.toBeNull();
    expect(initialImage?.getAttribute("src")).toBe(
      "axon://local/test-preview-ticket",
    );

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

  it("resolves raw HTML image and video sources to axon asset URLs", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={
            '![Img](./pic.png)\n\n<p align="center">\n  <video src="docs/media/demo.mp4" controls>\n    Demo recording.\n  </video>\n</p>'
          }
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    await flushPreview();

    const img = container.querySelector("img");
    const video = container.querySelector("video");
    expect(img?.getAttribute("src")).toBe("axon://local/test-preview-ticket");
    expect(video?.getAttribute("src")).toBe(
      "axon://local/test-preview-ticket",
    );
  });

  it("exposes a preview root that the video frame stylesheet targets", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={'<video controls src="docs/media/demo.mp4"></video>'}
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    await flushPreview();

    const scroller = container.querySelector(".axon-markdown-preview");
    expect(scroller).not.toBeNull();
    expect(scroller?.querySelector("video")).not.toBeNull();
  });

  it("plays a bare video on click and pauses it on a second click", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={'<video src="docs/media/demo.mp4"></video>'}
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    await flushPreview();

    const element = container.querySelector("video");
    expect(element).not.toBeNull();
    const video = element as HTMLVideoElement;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    video.play = play as unknown as typeof video.play;
    video.pause = pause as unknown as typeof video.pause;

    Object.defineProperty(video, "paused", {
      configurable: true,
      value: true,
      writable: true,
    });

    await act(async () => {
      video.click();
    });
    expect(play).toHaveBeenCalledTimes(1);

    Object.defineProperty(video, "paused", {
      configurable: true,
      value: false,
      writable: true,
    });

    await act(async () => {
      video.click();
    });
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("leaves a video that renders native controls to its own click behavior", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={'<video controls src="docs/media/demo.mp4"></video>'}
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    await flushPreview();

    const element = container.querySelector("video");
    expect(element).not.toBeNull();
    const video = element as HTMLVideoElement;
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    video.play = play as unknown as typeof video.play;
    video.pause = pause as unknown as typeof video.pause;

    await act(async () => {
      video.click();
    });
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("keeps checkbox toggles working alongside a bare video", async () => {
    const onContentChange = vi.fn();
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={
            '<video src="docs/media/demo.mp4"></video>\n\n- [ ] task one'
          }
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
          onContentChange={onContentChange}
        />,
      );
    });
    await flushPreview();
    await flushPreview();

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox!.click();
    });
    expect(onContentChange).toHaveBeenCalledTimes(1);
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

  it("does not reparse the document when the model re-pushes the same content", async () => {
    const morphdomSpy = vi.spyOn(morphdomModule, "morphdom");
    let changeHandler: () => void = () => {};
    let modelValue = "First line";
    const model = {
      isDisposed: () => false,
      getValue: () => modelValue,
      onDidChangeContent(callback: () => void) {
        changeHandler = callback;
        return { dispose() {} };
      },
    };
    monacoModelsMock.getModel.mockReturnValue(model);
    monacoModelsMock.onModelReady.mockImplementation((_path, bindModel) => {
      bindModel(model);
      return { dispose() {} };
    });

    await act(async () => {
      root.render(
        <MarkdownPreviewTab
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    const patchesAfterMount = morphdomSpy.mock.calls.length;
    expect(patchesAfterMount).toBeGreaterThan(0);
    expect(container.textContent).toContain("First line");

    // A real keystroke flows through to the preview.
    modelValue = "First line\nSecond line";
    await act(async () => {
      changeHandler();
    });
    await flushPreview();
    expect(morphdomSpy.mock.calls.length).toBeGreaterThan(patchesAfterMount);
    expect(container.textContent).toContain("Second line");

    // An autosave or watcher re-push of the same value is dropped before
    // it reaches the render pipeline, so the document is neither reparsed
    // nor repatched.
    const patchesAfterEdit = morphdomSpy.mock.calls.length;
    await act(async () => {
      changeHandler();
    });
    await flushPreview();
    expect(morphdomSpy.mock.calls.length).toBe(patchesAfterEdit);

    morphdomSpy.mockRestore();
  });

  it("skips image stabilization when a text edit leaves the media unchanged", async () => {
    const captureSpy = vi.spyOn(morphdomModule, "captureImageDimensions");

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"![Preview](./preview.png)\n\nVersion one"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    // The first cycle renders the placeholder src; the second stabilizes
    // the images when the real ticket URL is morphed in.
    await flushPreview();
    await flushPreview();
    const capturesAfterMount = captureSpy.mock.calls.length;
    expect(capturesAfterMount).toBeGreaterThan(0);

    // Editing only surrounding prose must not restyle the media node, so
    // the stabilization pass is skipped entirely for the repaint.
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"![Preview](./preview.png)\n\nVersion two"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    expect(captureSpy.mock.calls.length).toBe(capturesAfterMount);

    // Changing the media set itself re-enables stabilization.
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={
            "![Preview](./preview.png)\n\n![Second](./another.png)\n\nVersion three"
          }
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    expect(captureSpy.mock.calls.length).toBeGreaterThan(capturesAfterMount);

    captureSpy.mockRestore();
  });

  it("skips the DOM patch when the rendered HTML would be unchanged", async () => {
    const morphdomSpy = vi.spyOn(morphdomModule, "morphdom");

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"Stable document"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
          onContentChange={() => {}}
        />,
      );
    });
    await flushPreview();
    const patchesAfterFirstRender = morphdomSpy.mock.calls.length;
    expect(patchesAfterFirstRender).toBeGreaterThan(0);

    // A trailing content push that renders to the same HTML (for example a
    // model reset or a redundant watcher cycle) must not repaint the DOM.
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"Stable document"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
          onContentChange={() => {}}
        />,
      );
    });
    await flushPreview();
    expect(morphdomSpy.mock.calls.length).toBe(patchesAfterFirstRender);

    // A real content change does repaint.
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"Changed document"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
          onContentChange={() => {}}
        />,
      );
    });
    await flushPreview();
    expect(morphdomSpy.mock.calls.length).toBeGreaterThan(
      patchesAfterFirstRender,
    );

    morphdomSpy.mockRestore();
  });

  it("updates the video URL without replacing the media node", async () => {
    const content =
      '<video controls muted src="docs/media/demo.webm"></video>';
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={`${content}\n\nFirst sentence`}
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();
    await flushPreview();

    const firstVideo = container.querySelector("video");
    expect(firstVideo?.getAttribute("src")).toBe(
      "axon://local/test-preview-ticket",
    );

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={`${content}\n\nSecond sentence`}
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    // The media host stays mounted; the ticket URL is updated in place
    // instead of rebuilding the element on every nearby content change.
    expect(container.querySelector("video")).toBe(firstVideo);
    expect(firstVideo?.getAttribute("src")).toBe(
      "axon://local/test-preview-ticket",
    );
  });

  it("renders prose with the editor font family and comfortable leading", async () => {
    const fontFamily = "JetBrains Mono Variable, JetBrains Mono, monospace";
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"A paragraph of plain text."}
          filePath="/workspace/README.md"
          folderPath="/workspace"
          fontFamily={fontFamily}
        />,
      );
    });
    await flushPreview();

    const scroller = Array.from(
      (container.firstElementChild as HTMLElement).children,
    ).find((child) =>
      (child as HTMLElement).className.includes("overflow-y-auto"),
    ) as HTMLElement;
    expect(scroller.style.fontFamily.replace(/"/g, "")).toBe(fontFamily);
    expect(container.querySelector("p")?.textContent).toBe(
      "A paragraph of plain text.",
    );
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

  it("renders bold, emphasis, and strikethrough", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"**bold** and *emphasis* and ~~strike~~"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await flushPreview();

    expect(
      container.querySelector("strong")?.textContent,
    ).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("emphasis");
    expect(container.querySelector("del")?.textContent).toBe("strike");
    expect(container.textContent).toContain(" and ");
  });

  it("opens local markdown links in the editor instead of the web", async () => {
    const onOpenFile = vi.fn();
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={
            "Read the [Architecture Guide](architecture.md) and [notes](../docs/NOTES.md)."
          }
          filePath="/workspace/site/README.md"
          folderPath="/workspace"
          onOpenFile={onOpenFile}
        />,
      );
    });
    await flushPreview();

    const links = container.querySelectorAll<HTMLAnchorElement>("a[href]");
    await act(async () => {
      links[0]?.click();
    });
    expect(onOpenFile).toHaveBeenCalledWith(
      "/workspace/site/architecture.md",
    );

    await act(async () => {
      links[1]?.click();
    });
    expect(onOpenFile).toHaveBeenLastCalledWith(
      "/workspace/docs/NOTES.md",
    );
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