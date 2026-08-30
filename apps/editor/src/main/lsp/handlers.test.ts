import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcHandlers = new Map<string, (...args: any[]) => unknown>();
const featureMocks = vi.hoisted(() => ({
  executeLanguageServerCommand: vi.fn(),
  formatLanguageServerDocument: vi.fn(),
  getLanguageServerCodeActions: vi.fn(),
  getLanguageServerCompletions: vi.fn(),
  getLanguageServerDefinitions: vi.fn(),
  getLanguageServerHover: vi.fn(),
  getLanguageServerReferences: vi.fn(),
  getLanguageServerSemanticTokens: vi.fn(),
  getLanguageServerSignatureHelp: vi.fn(),
  getLanguageServerStatus: vi.fn(),
  renameLanguageServerSymbol: vi.fn(),
  resolveLanguageServerCompletionItem: vi.fn(),
  startLanguageServerForLanguage: vi.fn(),
  startRelevantLanguageServers: vi.fn(),
  stopRelevantLanguageServers: vi.fn(),
  syncDocumentWithLanguageServer: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));
vi.mock("./features", () => featureMocks);
vi.mock("../settings/io", () => ({
  readSettingsForFolder: vi.fn(async () => ({ lsp: { enabled: true } })),
}));

import { registerLspHandlers } from "./handlers";

function createCapabilities() {
  return {
    assertRoot: vi.fn((_rendererId: number, folderPath: string) => folderPath),
    assertReadablePath: vi.fn(
      (_rendererId: number, filePath: string) => filePath,
    ),
    assertWritablePath: vi.fn(
      (_rendererId: number, filePath: string) => filePath,
    ),
    authorizeReadOnlyFile: vi.fn(
      (_rendererId: number, filePath: string) => filePath,
    ),
  };
}

describe("language server IPC capabilities", () => {
  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();
  });

  it("authorizes both the workspace and document before hover reaches an LSP", async () => {
    const capabilities = createCapabilities();
    featureMocks.getLanguageServerHover.mockResolvedValue({
      ok: true,
      contents: [],
    });
    registerLspHandlers(capabilities as any);
    const folderPath = process.cwd();
    const filePath = path.join(folderPath, "package.json");

    await ipcHandlers.get("lsp:hover")!(
      { sender: { id: 41 } },
      { folderPath, filePath, languageId: "json", line: 0, character: 0 },
    );

    expect(capabilities.assertRoot).toHaveBeenCalledWith(41, folderPath);
    expect(capabilities.assertReadablePath).toHaveBeenCalledWith(41, filePath);
    expect(featureMocks.getLanguageServerHover).toHaveBeenCalledWith(
      expect.objectContaining({ folderPath, filePath }),
    );
  });

  it("grants exact read-only capabilities to external definition results", async () => {
    const capabilities = createCapabilities();
    const externalDefinition = "/sdk/types/library.d.ts";
    featureMocks.getLanguageServerDefinitions.mockResolvedValue({
      ok: true,
      locations: [{ filePath: externalDefinition, line: 2, character: 1 }],
    });
    registerLspHandlers(capabilities as any);
    const folderPath = process.cwd();

    await ipcHandlers.get("lsp:definition")!(
      { sender: { id: 42 } },
      {
        folderPath,
        filePath: path.join(folderPath, "package.json"),
        languageId: "json",
        line: 0,
        character: 0,
      },
    );

    expect(capabilities.authorizeReadOnlyFile).toHaveBeenCalledWith(
      42,
      externalDefinition,
    );
  });

  it("rejects rename edits that escape the renderer's writable paths", async () => {
    const capabilities = createCapabilities();
    const escapedPath = "/outside/rewritten.ts";
    capabilities.assertWritablePath.mockImplementation(
      (_rendererId: number, filePath: string) => {
        if (filePath === escapedPath) throw new Error("outside workspace");
        return filePath;
      },
    );
    featureMocks.renameLanguageServerSymbol.mockResolvedValue({
      ok: true,
      edits: { [escapedPath]: [] },
    });
    registerLspHandlers(capabilities as any);
    const folderPath = process.cwd();

    await expect(
      ipcHandlers.get("lsp:rename")!(
        { sender: { id: 43 } },
        {
          folderPath,
          filePath: path.join(folderPath, "package.json"),
          languageId: "typescript",
          line: 0,
          character: 0,
          newName: "renamed",
        },
      ),
    ).rejects.toThrow("outside workspace");
  });
});
