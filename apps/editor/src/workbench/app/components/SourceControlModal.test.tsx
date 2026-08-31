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
import { DEFAULT_SETTINGS } from "../../../shared/settings";
import type { ResolvedThemeTokens } from "../../../renderer/shared/lib/themeTokens";
import SourceControlModal from "@axon-builtin-git/git/SourceControlModal";

const sourceControlApi = vi.hoisted(() => ({
  commitSourceControlChanges: vi.fn(),
  copyGitText: vi.fn(),
  loadSourceControlDiff: vi.fn(),
  loadSourceControlStatus: vi.fn(),
  runSourceControlAction: vi.fn(),
  runSourceControlBatchAction: vi.fn(),
}));

vi.mock("@axon-builtin-git/git/lib/sourceControlApi", () => sourceControlApi);
vi.mock("@axon-builtin-git/git/GitDiffEditorView", () => ({
  default: () => null,
}));
vi.mock("@axon-builtin-git/git/GitWorkflowPanel", () => ({
  default: () => null,
}));
vi.mock("@axon-builtin-git/git/GitConfirmationDialog", () => ({
  default: () => null,
}));
vi.mock("@axon-builtin-media-preview/MediaPreview", () => ({
  default: () => null,
  isMediaFile: () => false,
}));
vi.mock("@axon-builtin-media-preview/BinaryFilePreview", () => ({
  default: () => null,
}));

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe("SourceControlModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    sourceControlApi.loadSourceControlStatus.mockReset();
    sourceControlApi.loadSourceControlStatus.mockResolvedValue({
      isRepository: true,
      root: "/workspace",
      branch: "main",
      changes: [],
      ignoredPaths: [],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(onOutput: (message: string) => void) {
    root.render(
      <SourceControlModal
        folderPath="/workspace"
        open
        onClose={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenDiff={vi.fn()}
        onOpenGraph={vi.fn()}
        onGitStatusChanged={vi.fn()}
        editorSettings={DEFAULT_SETTINGS.editor}
        themeSyntax={{}}
        themeTokens={{} as ResolvedThemeTokens}
        onOutput={onOutput}
      />,
    );
  }

  it("does not reload Git status when an output notification rerenders its parent", async () => {
    const firstOutput = vi.fn();
    const nextOutput = vi.fn();

    await act(async () => render(firstOutput));
    expect(sourceControlApi.loadSourceControlStatus).toHaveBeenCalledOnce();
    expect(firstOutput).toHaveBeenCalledOnce();

    await act(async () => render(nextOutput));
    expect(sourceControlApi.loadSourceControlStatus).toHaveBeenCalledOnce();
    expect(nextOutput).not.toHaveBeenCalled();
  });
});
