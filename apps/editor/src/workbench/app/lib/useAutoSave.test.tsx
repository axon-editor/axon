import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "./useAutoSave";

const bufferMocks = vi.hoisted(() => ({
  dispatchEditorSave: vi.fn(),
  getModel: vi.fn(),
  isModelMarkedDirty: vi.fn(),
}));

vi.mock("../../../renderer/features/editor/lib/buffer/monacoModels", () => ({
  getModel: bufferMocks.getModel,
  isModelMarkedDirty: bufferMocks.isModelMarkedDirty,
}));

vi.mock("../../../renderer/features/editor/lib/buffer/editorSave", () => ({
  dispatchEditorSave: bufferMocks.dispatchEditorSave,
}));

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function dirtyPanes(...filePaths: string[]) {
  return [
    {
      dirtyFiles: Object.fromEntries(filePaths.map((path) => [path, true])),
    },
  ] as Parameters<typeof useAutoSave>[0]["panes"];
}

describe("useAutoSave", () => {
  let container: HTMLDivElement;
  let root: Root;
  const versions = new Map<string, number>();
  const saveDetachedFile = vi.fn(async () => true);
  const onError = vi.fn();

  function Harness({ panes }: { panes: Parameters<typeof useAutoSave>[0]["panes"] }) {
    useAutoSave({
      enabled: true,
      panes,
      saveDetachedFile,
      onError,
    });
    return null;
  }

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    versions.clear();
    bufferMocks.dispatchEditorSave.mockReset();
    bufferMocks.getModel.mockReset();
    bufferMocks.isModelMarkedDirty.mockReset();
    saveDetachedFile.mockClear();
    onError.mockClear();
    bufferMocks.getModel.mockImplementation((path: string) => ({
      getVersionId: () => versions.get(path) ?? 1,
    }));
    bufferMocks.isModelMarkedDirty.mockReturnValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("uses the visible editor save owner before the detached fallback", () => {
    bufferMocks.dispatchEditorSave.mockReturnValue(true);

    act(() => root.render(<Harness panes={dirtyPanes("/workspace/app.ts")} />));
    act(() => vi.advanceTimersByTime(1_000));

    expect(bufferMocks.dispatchEditorSave).toHaveBeenCalledWith(
      "/workspace/app.ts",
    );
    expect(saveDetachedFile).not.toHaveBeenCalled();
  });

  it("saves a dirty hidden tab through its retained Monaco model", async () => {
    bufferMocks.dispatchEditorSave.mockReturnValue(false);

    act(() => root.render(<Harness panes={dirtyPanes("/workspace/hidden.ts")} />));
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(saveDetachedFile).toHaveBeenCalledWith("/workspace/hidden.ts");
  });

  it("does not postpone one file when another file receives a newer edit", () => {
    bufferMocks.dispatchEditorSave.mockReturnValue(true);
    versions.set("/workspace/a.ts", 1);
    versions.set("/workspace/b.ts", 1);

    act(() =>
      root.render(
        <Harness panes={dirtyPanes("/workspace/a.ts", "/workspace/b.ts")} />,
      ),
    );
    act(() => vi.advanceTimersByTime(500));

    versions.set("/workspace/a.ts", 2);
    act(() =>
      root.render(
        <Harness panes={dirtyPanes("/workspace/a.ts", "/workspace/b.ts")} />,
      ),
    );
    act(() => vi.advanceTimersByTime(500));

    expect(bufferMocks.dispatchEditorSave).toHaveBeenCalledTimes(1);
    expect(bufferMocks.dispatchEditorSave).toHaveBeenCalledWith(
      "/workspace/b.ts",
    );

    act(() => vi.advanceTimersByTime(500));
    expect(bufferMocks.dispatchEditorSave).toHaveBeenCalledWith(
      "/workspace/a.ts",
    );
  });
});
