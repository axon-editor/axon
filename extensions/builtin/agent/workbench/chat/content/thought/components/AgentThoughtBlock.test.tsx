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
} from "vitest";
import AgentThoughtBlock from "./AgentThoughtBlock";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("AgentThoughtBlock", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("collapses when thinking finishes and can be reopened", () => {
    act(() => {
      root.render(<AgentThoughtBlock content="plan the change" active />);
    });

    expect(container.textContent).toContain("plan the change");

    act(() => {
      root.render(
        <AgentThoughtBlock content="plan the change" active={false} />,
      );
    });

    expect(container.textContent).not.toContain("plan the change");

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(container.textContent).toContain("plan the change");
  });
});
