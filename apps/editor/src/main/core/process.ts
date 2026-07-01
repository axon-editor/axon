import fs from "fs";
import http from "http";
import path from "path";
import { spawn, type ChildProcess } from "child_process";

export interface BundledCoreControllerDependencies {
  isDev: boolean;
  axonCorePort: string;
}

export function createBundledCoreController(
  deps: BundledCoreControllerDependencies,
) {
  let bundledCoreProcess: ChildProcess | null = null;
  let bundledCoreWatchdog: ReturnType<typeof setInterval> | null = null;
  let bundledCoreHealthFailures = 0;
  let bundledCoreRestarting = false;

  function getAxonCoreHealthUrl() {
    return `http://127.0.0.1:${deps.axonCorePort}/health`;
  }

  function waitForAxonCore(timeoutMs = 5000) {
    const startedAt = Date.now();
    let pollInterval = 30;

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const check = () => {
        if (settled) return;
        const request = http.get(getAxonCoreHealthUrl(), (response) => {
          response.resume();
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) {
            settle(true);
            return;
          }
          retry();
        });

        request.on("error", retry);
        request.setTimeout(750, () => {
          request.destroy();
          retry();
        });
      };

      const retry = () => {
        if (settled) return;
        if (Date.now() - startedAt >= timeoutMs) {
          settle(false);
          return;
        }
        setTimeout(check, pollInterval);
        pollInterval = Math.min(Math.floor(pollInterval * 1.5), 200);
      };

      check();
    });
  }

  function probeAxonCoreOnce(timeoutMs = 150) {
    // Packaged launches normally own the bundled core process, so a long
    // pre-spawn poll only adds dead time. This single probe is just enough to
    // detect an orphaned/already-running core from a previous session without
    // delaying the common cold-start path.
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const request = http.get(getAxonCoreHealthUrl(), (response) => {
        response.resume();
        settle(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 500));
      });
      request.once("error", () => settle(false));
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        settle(false);
      });
    });
  }

  function getBundledCorePath() {
    const binaryName = process.platform === "win32" ? "axon-core.exe" : "axon-core";
    return path.join(process.resourcesPath, "core", binaryName);
  }

  async function startBundledAxonCore() {
    if (deps.isDev || bundledCoreProcess) return;

    if (await probeAxonCoreOnce(150)) return;

    const corePath = getBundledCorePath();
    if (!fs.existsSync(corePath)) {
      console.error(`bundled axon-core binary was not found at ${corePath}`);
      return;
    }

    // The packaged editor owns axon-core so users can open Axon like a normal
    // desktop app. I still check for an already-running server first because
    // developers may launch a packaged build while testing a local core, and
    // blindly spawning another process would only create a port conflict.
    bundledCoreProcess = spawn(corePath, [], {
      env: {
        ...process.env,
        AXON_CORE_PORT: deps.axonCorePort,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    bundledCoreProcess.stdout?.on("data", (chunk) => {
      console.log(`[axon-core] ${chunk.toString().trimEnd()}`);
    });
    bundledCoreProcess.stderr?.on("data", (chunk) => {
      console.error(`[axon-core] ${chunk.toString().trimEnd()}`);
    });
    bundledCoreProcess.on("exit", () => {
      bundledCoreProcess = null;
    });
    bundledCoreProcess.on("error", (err) => {
      console.error("failed to start bundled axon-core:", err);
      bundledCoreProcess = null;
    });

    const ready = await waitForAxonCore();
    if (!ready) {
      console.error("bundled axon-core did not become ready before timeout");
    }
  }

  function stopBundledAxonCore() {
    if (!bundledCoreProcess || bundledCoreProcess.killed) return;
    bundledCoreProcess.kill();
    bundledCoreProcess = null;
  }

  function startBundledCoreWatchdog() {
    if (deps.isDev || bundledCoreWatchdog) return;

    bundledCoreWatchdog = setInterval(() => {
      if (bundledCoreRestarting) return;

      void waitForAxonCore(1200).then(async (healthy) => {
        if (healthy) {
          bundledCoreHealthFailures = 0;
          return;
        }

        bundledCoreHealthFailures += 1;
        if (bundledCoreHealthFailures < 3) return;
        bundledCoreHealthFailures = 0;
        bundledCoreRestarting = true;

        // The bundled Go core owns file APIs and terminal PTYs. If it stops
        // answering health checks after the app has been open for a long time,
        // leaving the renderer to retry forever gives users a dead editor. The
        // packaged app can recover by restarting only its child core process; dev
        // mode is excluded because concurrently owns that process there.
        stopBundledAxonCore();
        await startBundledAxonCore();
        bundledCoreRestarting = false;
      });
    }, 15000);
  }

  function stopBundledCoreWatchdog() {
    if (!bundledCoreWatchdog) return;
    clearInterval(bundledCoreWatchdog);
    bundledCoreWatchdog = null;
  }

  return {
    startBundledAxonCore,
    stopBundledAxonCore,
    startBundledCoreWatchdog,
    stopBundledCoreWatchdog,
  };
}
