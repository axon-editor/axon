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
import { useWindowFullScreen } from "./useWindowFullScreen";

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("useWindowFullScreen", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fullScreenListener: ((isFullScreen: boolean) => void) | null;
  const unsubscribe = vi.fn();
  const isWindowFullScreen = vi.fn<() => Promise<boolean>>();

  function Harness() {
    const isFullScreen = useWindowFullScreen();
    return <output>{String(isFullScreen)}</output>;
  }

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
    fullScreenListener = null;
    unsubscribe.mockReset();
    isWindowFullScreen.mockReset();
    Object.defineProperty(window, "axon", {
      configurable: true,
      value: {
        isWindowFullScreen,
        onWindowFullScreenChanged: (
          listener: (isFullScreen: boolean) => void,
        ) => {
          fullScreenListener = listener;
          return unsubscribe;
        },
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("hydrates the native fullscreen state after a renderer reload", async () => {
    isWindowFullScreen.mockResolvedValue(true);

    await act(async () => root.render(<Harness />));

    expect(container.textContent).toBe("true");
  });

  it("tracks native fullscreen transitions and releases its listener", async () => {
    isWindowFullScreen.mockResolvedValue(false);
    await act(async () => root.render(<Harness />));

    act(() => fullScreenListener?.(true));
    expect(container.textContent).toBe("true");

    act(() => root.unmount());
    expect(unsubscribe).toHaveBeenCalledOnce();
    root = createRoot(container);
  });

  it("does not let a stale initial query overwrite a newer native event", async () => {
    let resolveInitialState: ((state: boolean) => void) | null = null;
    isWindowFullScreen.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveInitialState = resolve;
      }),
    );

    act(() => root.render(<Harness />));
    act(() => fullScreenListener?.(true));
    await act(async () => resolveInitialState?.(false));

    expect(container.textContent).toBe("true");
  });
});
