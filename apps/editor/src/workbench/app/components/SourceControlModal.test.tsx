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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(
    onOutput: (message: string) => void,
    onGitStatusChanged: () => Promise<void>,
  ) {
    root.render(
      <SourceControlModal
        folderPath="/workspace"
        open
        status={{
          isRepository: true,
          root: "/workspace",
          branch: "main",
          changes: [],
          ignoredPaths: [],
        }}
        onClose={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenDiff={vi.fn()}
        onOpenGraph={vi.fn()}
        onGitStatusChanged={onGitStatusChanged}
        editorSettings={DEFAULT_SETTINGS.editor}
        themeSyntax={{}}
        themeTokens={{} as ResolvedThemeTokens}
        onOutput={onOutput}
      />,
    );
  }

  it("reuses workbench Git status when output notifications rerender its parent", async () => {
    const firstOutput = vi.fn();
    const nextOutput = vi.fn();
    const refreshStatus = vi.fn(async () => undefined);

    await act(async () => render(firstOutput, refreshStatus));
    expect(refreshStatus).not.toHaveBeenCalled();
    expect(firstOutput).not.toHaveBeenCalled();

    await act(async () => render(nextOutput, refreshStatus));
    expect(refreshStatus).not.toHaveBeenCalled();
    expect(nextOutput).not.toHaveBeenCalled();
  });
});
