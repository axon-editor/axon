import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MarkdownPreview from "@axon-builtin-markdown/MarkdownPreview";

describe("MarkdownPreview", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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
});
