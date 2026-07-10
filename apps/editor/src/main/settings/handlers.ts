import { dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { type AxonSettings, type CustomFont } from "../../shared/settings";
import { readSettingsForFolder, writeSettingsToDisk } from "./io";
import { importCustomFontFile, listAvailableLocalFonts } from "../fonts/fonts";
import { getSettingsPath } from "./paths";
import { setClientId } from "../spotify/api";
import { AXON_SPOTIFY_CLIENT_ID } from "../generated/buildConfig";
import { detectPythonVirtualEnvForWorkspace } from "../lsp/session";

interface SettingsHandlersDependencies {
  authorizeWorkspaceRoot: (
    rendererId: number,
    rootPath: string,
    persist?: boolean,
  ) => string;
  assertWorkspaceRoot: (rendererId: number, rootPath: string) => string;
  getActiveLanguageServers: () => Iterable<{
    id: string;
    folderPath: string;
  }>;
  notifyPythonConfigurationForFolder: (folderPath: string) => void;
  startPythonLanguageServerForFolder: (folderPath: string) => Promise<void>;
}

export function registerSettingsHandlers(deps: SettingsHandlersDependencies) {
  ipcMain.handle("dialog:openFolder", async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return deps.authorizeWorkspaceRoot(event.sender.id, result.filePaths[0], true);
  });

  ipcMain.handle(
    "dialog:saveFileAs",
    async (event, suggestedPath: string, content: string) => {
      const result = await dialog.showSaveDialog({
        title: "Save As",
        defaultPath: suggestedPath,
      });
      if (result.canceled || !result.filePath) return null;

      // The native save dialog is the authority for an out-of-workspace target.
      // Writing in main keeps that explicit user choice separate from the broad
      // Core filesystem API and prevents the renderer from silently inventing a
      // destination that was never approved by the operating-system dialog.
      await fs.promises.mkdir(path.dirname(result.filePath), { recursive: true });
      await fs.promises.writeFile(result.filePath, content, "utf8");
      deps.authorizeWorkspaceRoot(
        event.sender.id,
        path.dirname(result.filePath),
        true,
      );
      return result.filePath;
    },
  );

  ipcMain.handle("dialog:importFont", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Font files",
          extensions: ["ttf", "otf", "woff", "woff2"],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return importCustomFontFile(result.filePaths[0]) as CustomFont;
  });

  ipcMain.handle("fonts:listAvailable", async () => {
    return listAvailableLocalFonts();
  });

  ipcMain.handle("dialog:selectEditorBackgroundImage", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select editor background image",
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "avif",
            "svg",
          ],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(
    "dialog:selectPythonVirtualEnv",
    async (event, folderPath?: string | null) => {
      if (folderPath) {
        deps.assertWorkspaceRoot(event.sender.id, folderPath);
      }
      const defaultPath =
        folderPath && fs.existsSync(folderPath) ? folderPath : undefined;
      const result = await dialog.showOpenDialog({
        title: "Select Python virtual environment",
        defaultPath,
        properties: ["openDirectory"],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const virtualEnvPath = result.filePaths[0];
      const candidates =
        process.platform === "win32"
          ? [
              path.join(virtualEnvPath, "Scripts", "python.exe"),
              path.join(virtualEnvPath, "Scripts", "python"),
            ]
          : [
              path.join(virtualEnvPath, "bin", "python3"),
              path.join(virtualEnvPath, "bin", "python"),
            ];

      const interpreterPath = candidates.find((candidate) =>
        fs.existsSync(candidate),
      );
      if (!interpreterPath) {
        throw new Error(
          "The selected folder does not look like a Python virtual environment.",
        );
      }

      return {
        virtualEnvPath,
        interpreterPath,
      };
    },
  );

  ipcMain.handle("settings:get", async (event, folderPath?: string | null) => {
    if (folderPath) {
      deps.assertWorkspaceRoot(event.sender.id, folderPath);
    }
    const settings = await readSettingsForFolder(folderPath);
    const settingsPath = getSettingsPath(folderPath);
    const hasWorkspaceSettings =
      Boolean(folderPath) && fs.existsSync(settingsPath);
    if (
      folderPath &&
      (!hasWorkspaceSettings ||
        (!settings.lsp.pythonVirtualEnvPath &&
          !settings.lsp.pythonInterpreterPath))
    ) {
      const detected = detectPythonVirtualEnvForWorkspace(folderPath);
      if (detected.virtualEnvPath && detected.interpreterPath) {
        // I return the detected environment in the in-memory settings shape so
        // Settings and Pyright agree immediately, but I do not write it to
        // axon.json until the user saves. That keeps auto-detection helpful
        // without silently changing a workspace file just because Settings was
        // opened.
        return {
          ...settings,
          lsp: {
            ...settings.lsp,
            pythonVirtualEnvPath: detected.virtualEnvPath,
            pythonInterpreterPath: detected.interpreterPath,
          },
        };
      }

      if (!hasWorkspaceSettings) {
        // User settings are global, but Python interpreters are usually tied
        // to one project. If a previous workspace saved a venv globally, I
        // clear that value for a new workspace unless this workspace has its
        // own axon.json. Otherwise switching folders can make Pyright point at
        // the wrong project's packages and the picker looks broken.
        return {
          ...settings,
          lsp: {
            ...settings.lsp,
            pythonVirtualEnvPath: "",
            pythonInterpreterPath: "",
          },
        };
      }
    }
    if (!folderPath) {
      writeSettingsToDisk(settings, settingsPath);
    }
    return settings;
  });

  ipcMain.handle(
    "settings:update",
    async (event, settings: AxonSettings, folderPath?: string | null) => {
      if (folderPath) {
        deps.assertWorkspaceRoot(event.sender.id, folderPath);
      }
      const normalizedSettings = writeSettingsToDisk(
        settings,
        getSettingsPath(folderPath),
      );

      for (const session of deps.getActiveLanguageServers()) {
        if (
          session.id === "python" &&
          (!folderPath ||
            path.resolve(session.folderPath) === path.resolve(folderPath))
        ) {
          deps.notifyPythonConfigurationForFolder(session.folderPath);
        }
      }
      if (folderPath) {
        void deps.startPythonLanguageServerForFolder(folderPath);
      }
      if (!AXON_SPOTIFY_CLIENT_ID) {
        const updatedClientId = normalizedSettings.spotify?.clientId ?? "";
        setClientId(updatedClientId);
      }

      return normalizedSettings;
    },
  );

  ipcMain.handle(
    "settings:ensureFile",
    async (event, folderPath?: string | null, settings?: AxonSettings) => {
      const pathForSettings = getSettingsPath(folderPath);
      // Creating workspace settings is still a filesystem write. Requiring an
      // existing capability here prevents the renderer from turning this helper
      // into an arbitrary-directory authorization primitive. Global settings are
      // main-owned under userData and therefore do not need a workspace grant.
      if (folderPath) {
        deps.assertWorkspaceRoot(event.sender.id, folderPath);
      }
      if (fs.existsSync(pathForSettings)) return pathForSettings;
      if (!folderPath) return pathForSettings;

      const nextSettings = settings ?? (await readSettingsForFolder(folderPath));
      writeSettingsToDisk(nextSettings, pathForSettings);
      return pathForSettings;
    },
  );
}
