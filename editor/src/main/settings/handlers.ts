import { dialog, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { type AxonSettings, type CustomFont } from "../../shared/settings";
import { readSettingsForFolder, writeSettingsToDisk } from "./io";
import { importCustomFontFile } from "../fonts/fonts";
import { getSettingsPath } from "./paths";
import { setClientId } from "../spotify/api";

interface SettingsHandlersDependencies {
  getActiveLanguageServers: () => Iterable<{
    id: string;
    folderPath: string;
  }>;
  notifyPythonConfigurationForFolder: (folderPath: string) => void;
}

export function registerSettingsHandlers(deps: SettingsHandlersDependencies) {
  ipcMain.handle("dialog:openFolder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

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

  ipcMain.handle("dialog:selectPythonVirtualEnv", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Python virtual environment",
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
  });

  ipcMain.handle("settings:get", async (_event, folderPath?: string | null) => {
    const settings = readSettingsForFolder(folderPath);
    if (!folderPath || fs.existsSync(getSettingsPath(folderPath))) {
      writeSettingsToDisk(settings, getSettingsPath(folderPath));
    }
    return settings;
  });

  ipcMain.handle(
    "settings:update",
    async (_event, settings: AxonSettings, folderPath?: string | null) => {
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
      // Inside the existing settings:update handler, after saving:
      const updatedClientId = normalizedSettings.spotify?.clientId ?? "";
      setClientId(updatedClientId);

      return normalizedSettings;
    },
  );

  ipcMain.handle(
    "settings:ensureFile",
    async (_event, folderPath?: string | null, settings?: AxonSettings) => {
      const pathForSettings = getSettingsPath(folderPath);
      if (fs.existsSync(pathForSettings)) return pathForSettings;
      if (!folderPath) return pathForSettings;

      const nextSettings = settings ?? readSettingsForFolder(folderPath);
      writeSettingsToDisk(nextSettings, pathForSettings);
      return pathForSettings;
    },
  );
}
