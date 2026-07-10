import { app, type BrowserWindow, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { type UpdateActionResult, type UpdateInfo, type UpdateInstallState } from "../../shared/updates";

interface UpdateManagerDependencies {
  sendToRenderer: (channel: string, payload?: unknown, targetWindow?: BrowserWindow | null) => void;
  releaseApiUrl: string;
  releasePageUrl: string;
  isDev: boolean;
  isMac: boolean;
  isWindows: boolean;
  execFileAsync: (file: string, args: string[]) => Promise<unknown>;
  resolveMacAppBundlePath: () => string | null;
}

interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  body?: string;
}

function parseVersionParts(version: string) {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => {
      const number = Number.parseInt(part, 10);
      return Number.isFinite(number) ? number : 0;
    });
}

function compareVersions(left: string, right: string) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function normalizeUpdatePageUrl(
  candidateUrl: string | undefined,
  releasePageUrl: string,
) {
  if (!candidateUrl) return releasePageUrl;

  try {
    const parsedUrl = new URL(candidateUrl);
    const isAxonReleaseUrl =
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === "github.com" &&
      parsedUrl.pathname.startsWith("/axon-editor/axon/releases");

    return isAxonReleaseUrl ? parsedUrl.toString() : releasePageUrl;
  } catch {
    return releasePageUrl;
  }
}

export class UpdateManager {
  private state: UpdateInstallState = { phase: "idle" };
  private updateInstallTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: UpdateManagerDependencies) { }

  getState() {
    return this.state;
  }

  configureAutoUpdater() {
    // Axon already has its own release-notes check against the GitHub Releases
    // API. The auto-updater is only responsible for downloading and installing
    // the packaged artifact, so I disable automatic downloads here and let the
    // user start that step from the in-app update modal.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;

    if (this.deps.isWindows) {
      // Axon is still distributed as an unsigned personal build on Windows.
      // SmartScreen can still warn during first install because that trust
      // decision belongs to Windows, but electron-updater also has its own
      // NSIS signature check before it applies a downloaded update. If we let
      // that check run without a real code-signing certificate, the app can
      // download an update successfully and then refuse to install it with an
      // invalid-signature error. This temporary bypass keeps in-app updates
      // usable for personal unsigned builds; when Axon gets a real Windows
      // signing certificate, this should be removed and the publisher name
      // should come from the certificate.
      (
        autoUpdater as typeof autoUpdater & {
          verifyUpdateCodeSignature?: (
            publisherNames: string[],
            path: string,
          ) => Promise<string | null>;
        }
      ).verifyUpdateCodeSignature = async () => null;
    }

    autoUpdater.on("checking-for-update", () => {
      this.publish({ phase: "checking" });
    });

    autoUpdater.on("update-available", (info) => {
      this.publish({
        phase: "available",
        version: info.version,
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      this.publish({
        phase: "not-available",
        version: info.version,
        message: "Axon is current.",
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.publish({
        phase: "downloading",
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      // Once a package is fully downloaded, a normal user-driven app quit should
      // also finish the update. That matches editors like Zed/VS Code: the app
      // does not interrupt work, but the next restart applies the ready package.
      autoUpdater.autoInstallOnAppQuit = true;
      this.publish({
        phase: "downloaded",
        version: info.version,
        message: "Ready to install.",
      });
    });

    autoUpdater.on("error", (error) => {
      this.publish({
        phase: "error",
        message: error.message,
      });
    });
  }

  async checkForUpdate(): Promise<UpdateInfo> {
    const currentVersion = app.getVersion();
    const checkedAt = new Date().toISOString();

    try {
      // I keep update discovery in the main process because it already owns the
      // trusted Electron surface. The renderer only receives a small typed result,
      // so a failed request or a malformed GitHub payload cannot leak networking
      // details into UI state beyond a simple "no update information" message.
      const response = await fetch(this.deps.releaseApiUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Axon/${currentVersion}`,
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}.`);
      }

      const release = (await response.json()) as GitHubReleasePayload;
      const latestVersion = release.tag_name?.replace(/^v/i, "") ?? currentVersion;
      const releaseUrl = release.html_url ?? this.deps.releasePageUrl;

      return {
        currentVersion,
        latestVersion,
        updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
        releaseUrl,
        releaseNotes: release.body?.trim() || "No release notes were provided.",
        checkedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update check failed.";
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseUrl: this.deps.releasePageUrl,
        releaseNotes: "",
        checkedAt,
        error: message,
      };
    }
  }

  async requestDownload(): Promise<UpdateActionResult> {
    if (this.deps.isDev) {
      const message = "Packaged builds are required for in-app updates.";
      this.publish({ phase: "error", message });
      return { ok: false, message };
    }

    const macInstallBlocker = await this.getMacUpdateInstallBlocker();
    if (macInstallBlocker) {
      this.publish({ phase: "error", message: macInstallBlocker });
      return { ok: false, message: macInstallBlocker };
    }

    if (this.state.phase === "checking" || this.state.phase === "downloading") {
      return { ok: true, message: "Update download is already running." };
    }
    if (this.state.phase === "downloaded") {
      return { ok: true, message: "Update is ready to install." };
    }

    try {
      this.publish({ phase: "checking" });
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = result?.updateInfo?.version;
      // `electron-updater` reads platform-specific metadata such as latest.yml
      // from the GitHub release. I still compare versions here before calling
      // downloadUpdate because a stale modal or a repeated click should not ask
      // the updater to download when the installed app is already current.
      if (!latestVersion || compareVersions(latestVersion, app.getVersion()) <= 0) {
        this.publish({
          phase: "not-available",
          version: latestVersion ?? app.getVersion(),
          message: "Axon is current.",
        });
        return { ok: false, message: "Axon is current." };
      }

      this.publish({
        phase: "downloading",
        version: latestVersion,
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        message: "Downloading update.",
      });
      // Let the IPC call resolve immediately so the renderer can show feedback
      // while electron-updater streams progress through the event listeners above.
      void autoUpdater.downloadUpdate().catch((err) => {
        const message =
          err instanceof Error ? err.message : "Failed to download update.";
        this.publish({ phase: "error", message });
      });
      return { ok: true, message: "Downloading update." };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to download update.";
      this.publish({ phase: "error", message });
      return { ok: false, message };
    }
  }

  async requestInstall(): Promise<UpdateActionResult> {
    const macInstallBlocker = await this.getMacUpdateInstallBlocker();
    if (macInstallBlocker) {
      this.publish({ phase: "error", message: macInstallBlocker });
      return { ok: false, message: macInstallBlocker };
    }

    // Installation is intentionally gated on the downloaded state. Calling
    // quitAndInstall too early can close the editor without a ready installer,
    // which is the worst possible failure mode for an update button.
    if (this.state.phase !== "downloaded") {
      return {
        ok: false,
        message: "Download the update before installing.",
      };
    }

    this.publish({
      ...this.state,
      phase: "installing",
      message: "Restarting to install update.",
    });
    autoUpdater.autoInstallOnAppQuit = true;
    if (this.updateInstallTimeout) clearTimeout(this.updateInstallTimeout);

    // I schedule the actual restart after the IPC handler returns because the
    // renderer is waiting for this call to resolve before it can record the
    // action in Output. Calling quitAndInstall synchronously from inside the IPC
    // handler can leave the UI in an "Installing" state with no recovery if the
    // updater does not immediately close the app.
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to install update.";
        this.publish({ phase: "error", message });
      }
    }, 100);

    this.updateInstallTimeout = setTimeout(() => {
      if (this.state.phase !== "installing") return;

      this.publish({
        phase: "downloaded",
        version: this.state.version,
        message:
          "Axon could not restart automatically. Quit and reopen Axon to finish installing the downloaded update.",
      });
    }, 10000);

    return { ok: true, message: "Installing update." };
  }

  async openReleasePage(releaseUrl?: string) {
    await shell.openExternal(
      normalizeUpdatePageUrl(releaseUrl, this.deps.releasePageUrl),
    );
  }

  private async getMacUpdateInstallBlocker() {
    if (!this.deps.isMac || this.deps.isDev || !app.isPackaged) return null;

    const appBundlePath = this.deps.resolveMacAppBundlePath();
    if (!appBundlePath) {
      return "Axon could not locate the macOS app bundle. Download the latest DMG from GitHub.";
    }

    try {
      await this.deps.execFileAsync("codesign", [
        "--verify",
        "--deep",
        "--strict",
        appBundlePath,
      ]);
      return null;
    } catch {
      return "This Axon macOS build is not code signed, so macOS cannot apply in-app updates. Download the latest DMG from GitHub.";
    }
  }

  private publish(nextState: UpdateInstallState) {
    // I keep the current state cached here before broadcasting it because the
    // update modal may open after a download has already started or completed.
    // Without this cache, the renderer could only react to future events and
    // would show an idle button even though the updater is already mid-flow.
    this.state = nextState;
    this.deps.sendToRenderer("app:updateState", this.state);
  }
}
