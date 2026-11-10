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
import AgentToolCard from "./AgentToolCard";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("AgentToolCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = (tool: Parameters<typeof AgentToolCard>[0]["tool"]) => {
    act(() => {
      root.render(
        <AgentToolCard
          tool={tool}
          onRun={vi.fn()}
          onSkip={vi.fn()}
          onOpenFile={vi.fn()}
        />,
      );
    });
  };

  const clickHeader = () => {
    act(() => {
      container.querySelector("button")?.click();
    });
  };

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("auto-collapses a running command and hides output behind a toggle", () => {
    const running = {
      id: "call-1",
      name: "shell",
      kind: "workspace" as const,
      title: "Run command",
      arguments: { command: "echo hello" },
      status: "running" as const,
    };
    render(running);
    expect(container.textContent).not.toContain("Show output");

    render({
      ...running,
      status: "done",
      result: "RESULT_MARKER",
    });
    expect(container.textContent).not.toContain("Show output");

    clickHeader();
    expect(container.textContent).toContain("Show output");
    expect(container.textContent).not.toContain("RESULT_MARKER");

    act(() => {
      const showOutput = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.includes("Show output"),
      );
      showOutput?.click();
    });
    expect(container.textContent).toContain("RESULT_MARKER");
  });

  it("keeps read results hidden when expanded", () => {
    render({
      id: "call-2",
      name: "read",
      kind: "workspace",
      title: "Read file",
      arguments: { path: "src/index.ts" },
      status: "done",
      result: "secret file content",
    });

    clickHeader();

    expect(container.textContent).toContain("src/index.ts");
    expect(container.textContent).toContain("File content is hidden");
    expect(container.textContent).not.toContain("secret file content");
    expect(container.textContent).toContain("Open");
  });

  it("expands a pending approval", () => {
    render({
      id: "call-3",
      name: "run_command",
      kind: "workspace",
      title: "Run command",
      arguments: { command: "npm test" },
      status: "pending",
    });

    expect(container.textContent).toContain("Skip");
    expect(container.textContent).toContain("Run");
  });
});
