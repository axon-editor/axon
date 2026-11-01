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
import type { AppGlassMode } from "../../../../shared/core/settings";
import { useNativeGlassSurface } from "./useNativeGlassSurface";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let container: HTMLDivElement;
let root: Root;
let setWindowGlass: ReturnType<typeof vi.fn>;
let refreshWindowGlass: ReturnType<typeof vi.fn>;
let animationFrames: FrameRequestCallback[];

function Harness({ mode }: { mode: AppGlassMode }) {
  useNativeGlassSurface(mode, "#000000", "dark");
  return null;
}

function flushAnimationFrame() {
  const callbacks = animationFrames;
  animationFrames = [];
  callbacks.forEach((callback) => callback(0));
}

beforeAll(() => {
  reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  setWindowGlass = vi.fn(() => Promise.resolve());
  refreshWindowGlass = vi.fn(() => Promise.resolve());
  animationFrames = [];
  vi.stubGlobal("axon", { setWindowGlass, refreshWindowGlass });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  animationFrames = [];
  container.remove();
  document.documentElement.classList.remove("axon-native-glass");
  vi.unstubAllGlobals();
});

describe("useNativeGlassSurface", () => {
  it("requests a repaint after the first Glass frame when Glass turns on", async () => {
    await act(async () => {
      root.render(<Harness mode="off" />);
    });

    expect(setWindowGlass).toHaveBeenLastCalledWith("off", "#000000", "dark");
    expect(refreshWindowGlass).not.toHaveBeenCalled();
    expect(
      document.documentElement.classList.contains("axon-native-glass"),
    ).toBe(false);

    await act(async () => {
      root.render(<Harness mode="system" />);
    });

    expect(setWindowGlass).toHaveBeenLastCalledWith(
      "system",
      "#000000",
      "dark",
    );
    expect(animationFrames).toHaveLength(1);
    expect(refreshWindowGlass).not.toHaveBeenCalled();

    await act(async () => {
      flushAnimationFrame();
    });
    expect(animationFrames).toHaveLength(1);
    expect(refreshWindowGlass).not.toHaveBeenCalled();

    await act(async () => {
      flushAnimationFrame();
    });
    expect(refreshWindowGlass).toHaveBeenCalledTimes(1);
    expect(
      document.documentElement.classList.contains("axon-native-glass"),
    ).toBe(true);
  });

  it("does not request a repaint when Glass was already on", async () => {
    await act(async () => {
      root.render(<Harness mode="system" />);
    });

    expect(refreshWindowGlass).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<Harness mode="live" />);
    });

    expect(refreshWindowGlass).not.toHaveBeenCalled();
  });

  it("removes the native Glass class when Glass turns off", async () => {
    await act(async () => {
      root.render(<Harness mode="system" />);
    });

    expect(
      document.documentElement.classList.contains("axon-native-glass"),
    ).toBe(true);

    await act(async () => {
      root.render(<Harness mode="off" />);
    });

    expect(
      document.documentElement.classList.contains("axon-native-glass"),
    ).toBe(false);
  });
});
