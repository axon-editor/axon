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

const mermaidMock = vi.hoisted(() => ({
  bindFunctions: vi.fn(),
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidMock.initialize,
    render: mermaidMock.render,
  },
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
});
