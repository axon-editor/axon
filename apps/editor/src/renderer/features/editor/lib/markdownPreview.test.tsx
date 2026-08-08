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
import { publishMarkdownScroll } from "@axon-builtin-markdown/lib/markdownPreviewSync";

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
  openExternalLink: vi.fn(),
  saveMarkdownPdf: vi.fn(),
}));

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
    bridgeMock.openExternalLink.mockReset();
    bridgeMock.saveMarkdownPdf.mockReset();
    bridgeMock.saveMarkdownPdf.mockResolvedValue("/tmp/README.pdf");
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
    vi.useRealTimers();
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

    expect(container.querySelector("img")).toBe(initialImage);
    expect(container.textContent).toContain("Second version");
  });

  it("renders Mermaid fences lazily with strict security and theme colors", async () => {
    vi.useFakeTimers();
    document.documentElement.style.setProperty(
      "--axon-editor-background",
      "#101216",
    );
    document.documentElement.style.setProperty(
      "--axon-editor-foreground",
      "#f2f4f8",
    );
    document.documentElement.style.setProperty(
      "--axon-panel-background",
      "#181c23",
    );
    document.documentElement.style.setProperty(
      "--axon-panel-border",
      "#38404d",
    );
    document.documentElement.style.setProperty(
      "--axon-syntax-function",
      "#70b7ff",
    );

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"```mermaid\nflowchart LR\n  A --> B\n```"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    expect(mermaidMock.render).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });

    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        maxEdges: 500,
        maxTextSize: 100_000,
        securityLevel: "strict",
        startOnLoad: false,
        suppressErrorRendering: true,
        themeVariables: expect.objectContaining({
          background: "#101216",
          lineColor: "#70b7ff",
          primaryColor: "#181c23",
          primaryTextColor: "#f2f4f8",
        }),
      }),
    );
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.stringMatching(/^axon-mermaid-/),
      "flowchart LR\n  A --> B",
    );
    expect(container.querySelector('[data-testid="rendered-mermaid"]')).not.toBeNull();
    expect(mermaidMock.bindFunctions).toHaveBeenCalled();
  });

  it("shows a compact error instead of breaking the Markdown preview", async () => {
    vi.useFakeTimers();
    mermaidMock.render.mockRejectedValue(
      new Error("Parse error on line 2\nUnexpected token"),
    );

    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"```mermaid\nflowchart broken\n```"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Parse error on line 2",
    );
    expect(container.textContent).not.toContain("Unexpected token");
  });

  it("syntax-highlights ordinary code fences with Monaco tokenization", async () => {
    vi.useFakeTimers();
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"```ts\nconst answer = 42;\n```"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(monacoMock.colorize).toHaveBeenCalledWith(
      "const answer = 42;",
      "typescript",
      { tabSize: 4 },
    );
    expect(container.querySelector("pre span")?.textContent).toBe("const");
  });

  it("recolorizes code fences when the active Axon theme changes", async () => {
    vi.useFakeTimers();
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={"```ts\nconst themed = true;\n```"}
          filePath="/workspace/README.md"
          folderPath="/workspace"
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(monacoMock.colorize).toHaveBeenCalledTimes(1);

    // Axon changes root theme tokens and Monaco's global theme together. The
    // highlighted HTML must be regenerated after that switch because Monaco
    // resolves each token color at colorize time; retaining the old HTML would
    // leave preview fences painted with the previous theme until the Markdown
    // source happened to change.
    await act(async () => {
      document.documentElement.style.setProperty(
        "--axon-editor-background",
        "#101010",
      );
      await Promise.resolve();
    });

    expect(monacoMock.colorize).toHaveBeenCalledTimes(2);
  });

  it("renders math, GFM footnotes, callouts, and YAML frontmatter", async () => {
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

    expect(container.textContent).toContain("Frontmatter");
    expect(container.textContent).toContain("Markdown reference");
    expect(container.querySelector('[data-callout="warning"]')).not.toBeNull();
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector("[data-footnote-ref]")).not.toBeNull();
    expect(container.textContent).toContain("Footnote content");
  });

  it("renders static MDX components without executing expressions", async () => {
    await act(async () => {
      root.render(
        <MarkdownPreview
          content={
            '<Callout type="tip">Static **MDX** content</Callout>\n\n<Badge>beta</Badge>\n\n{dangerousExpression}'
          }
          filePath="/workspace/guide.mdx"
          folderPath="/workspace"
        />,
      );
    });

    expect(container.querySelector('[data-callout="tip"]')).not.toBeNull();
    expect(container.textContent).toContain("Static MDX content");
    expect(container.textContent).toContain("beta");
    expect(container.textContent).toContain("{dangerousExpression}");
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

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBeNull();
  });

  it("resolves wiki links and frontmatter-backed citations", async () => {
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

    expect(
      container.querySelector('a[data-wiki-link="Architecture Guide"]')?.getAttribute("href"),
    ).toContain("Architecture%20Guide.md");
    expect(container.querySelector('a[data-citation="axon2026"]')).not.toBeNull();
    expect(container.querySelector("#citation-axon2026")?.textContent).toContain(
      "Axon Architecture",
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

    const target = container.querySelector<HTMLElement>('[data-source-line="5"]');
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

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Export Markdown as PDF"]')
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
