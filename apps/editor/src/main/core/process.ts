import fs from "fs";
import http from "http";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { createHmac, randomBytes } from "crypto";

export interface BundledServiceControllerDependencies {
  isDev: boolean;
  service: "core" | "pty-host";
  displayName: string;
  binaryName: string;
  port: string;
  token: string;
  portEnvironmentVariable: string;
  tokenEnvironmentVariable: string;
  terminalHealthPath?: string;
  confirmRestart: (request: CoreRestartConfirmation) => Promise<boolean>;
  isShuttingDown: () => boolean;
  onStatusChange?: (status: CoreProcessStatus) => void;
}

export type CoreProcessStatus =
  | "starting"
  | "healthy"
  | "unresponsive"
  | "restarting"
  | "stopped"
  | "crashed";

export interface CoreRestartConfirmation {
  service: "core" | "pty-host";
  displayName: string;
  reason: "unresponsive" | "crashed";
  terminalSessionCount: number | null;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
}

export function createBundledServiceController(
  deps: BundledServiceControllerDependencies,
) {
  let bundledCoreProcess: ChildProcess | null = null;
  let bundledCoreWatchdog: ReturnType<typeof setInterval> | null = null;
  let bundledCoreHealthFailures = 0;
  let bundledCoreRestarting = false;
  let recoveryPromptActive = false;
  let restartDeclinedUntil = 0;
  const expectedCoreExits = new WeakSet<ChildProcess>();

  function getHealthUrl() {
    return `http://127.0.0.1:${deps.port}/health`;
  }

  function reportStatus(status: CoreProcessStatus) {
    deps.onStatusChange?.(status);
  }

  async function getTerminalSessionCount() {
    if (!deps.terminalHealthPath) return 0;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 900);
    try {
      const response = await fetch(
        `http://127.0.0.1:${deps.port}${deps.terminalHealthPath}`,
        {
          headers: { Authorization: `Bearer ${deps.token}` },
          signal: controller.signal,
        },
      );
      if (!response.ok) return null;
      const snapshot = (await response.json()) as { sessionCount?: unknown };
      return typeof snapshot.sessionCount === "number"
        ? snapshot.sessionCount
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function createHealthProof() {
    const challenge = randomBytes(24).toString("hex");
    const expectedProof = createHmac("sha256", deps.token)
      .update(challenge)
      .digest("hex");
    return { challenge, expectedProof };
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
        const { challenge, expectedProof } = createHealthProof();
        const request = http.get(
          getHealthUrl(),
          {
            headers: {
              Authorization: `Bearer ${deps.token}`,
              "X-Axon-Challenge": challenge,
            },
          },
          (response) => {
            response.resume();
            if (
              response.statusCode === 200 &&
              response.headers["x-axon-core-proof"] === expectedProof
            ) {
              settle(true);
              return;
            }
            retry();
          },
        );

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
      const { challenge, expectedProof } = createHealthProof();
      const request = http.get(
        getHealthUrl(),
        {
          headers: {
            Authorization: `Bearer ${deps.token}`,
            "X-Axon-Challenge": challenge,
          },
        },
        (response) => {
          response.resume();
          settle(
            response.statusCode === 200 &&
              response.headers["x-axon-core-proof"] === expectedProof,
          );
        },
      );
      request.once("error", () => settle(false));
      request.setTimeout(timeoutMs, () => {
        request.destroy();
        settle(false);
      });
    });
  }

  function getBundledServicePath() {
    const binaryName = `${deps.binaryName}${process.platform === "win32" ? ".exe" : ""}`;
    return path.join(process.resourcesPath, "core", binaryName);
  }

  async function start() {
    if (deps.isDev || bundledCoreProcess) return;

    if (await probeAxonCoreOnce(150)) return;

    const servicePath = getBundledServicePath();
    if (!fs.existsSync(servicePath)) {
      console.error(
        `bundled ${deps.displayName} binary was not found at ${servicePath}`,
      );
      return;
    }

    // The packaged editor owns axon-core so users can open Axon like a normal
    // desktop app. I still check for an already-running server first because
    // developers may launch a packaged build while testing a local core, and
    // blindly spawning another process would only create a port conflict.
    reportStatus("starting");
    const child = spawn(servicePath, [], {
      env: {
        ...process.env,
        [deps.portEnvironmentVariable]: deps.port,
        [deps.tokenEnvironmentVariable]: deps.token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    bundledCoreProcess = child;

    child.stdout?.on("data", (chunk) => {
      console.log(`[${deps.service}] ${chunk.toString().trimEnd()}`);
    });
    child.stderr?.on("data", (chunk) => {
      console.error(`[${deps.service}] ${chunk.toString().trimEnd()}`);
    });
    child.on("exit", (code, signal) => {
      if (bundledCoreProcess === child) bundledCoreProcess = null;
      if (expectedCoreExits.has(child) || deps.isShuttingDown()) {
        reportStatus("stopped");
        return;
      }
      reportStatus("crashed");
      void requestCoreRestart({
        service: deps.service,
        displayName: deps.displayName,
        reason: "crashed",
        terminalSessionCount: 0,
        exitCode: code,
        exitSignal: signal,
      });
    });
    child.on("error", (err) => {
      console.error(`failed to start bundled ${deps.displayName}:`, err);
      if (bundledCoreProcess === child) bundledCoreProcess = null;
    });

    const ready = await waitForAxonCore();
    if (!ready) {
      console.error(
        `bundled ${deps.displayName} did not become ready before timeout`,
      );
      reportStatus("unresponsive");
      return;
    }
    reportStatus("healthy");
  }

  async function stop() {
    const child = bundledCoreProcess;
    if (!child || child.killed) return;

    expectedCoreExits.add(child);
    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(settle, 2000);
      child.once("exit", settle);
      child.kill();
    });
    if (bundledCoreProcess === child) bundledCoreProcess = null;
  }

  async function restart() {
    bundledCoreRestarting = true;
    reportStatus("restarting");
    try {
      await stop();
      await start();
    } finally {
      bundledCoreRestarting = false;
    }
  }

  async function requestCoreRestart(request: CoreRestartConfirmation) {
    if (
      recoveryPromptActive ||
      bundledCoreRestarting ||
      deps.isShuttingDown() ||
      Date.now() < restartDeclinedUntil
    ) {
      return;
    }

    recoveryPromptActive = true;
    try {
      const confirmed = await deps.confirmRestart(request);
      if (!confirmed) {
        // A declined restart protects the user's terminal state. The cooldown
        // prevents a watchdog that is still observing the same outage from
        // reopening the destructive prompt every 45 seconds while they inspect
        // or recover the process themselves.
        restartDeclinedUntil = Date.now() + 5 * 60_000;
        return;
      }
      await restart();
    } finally {
      recoveryPromptActive = false;
    }
  }

  function startWatchdog() {
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
        reportStatus("unresponsive");

        // A service supervisor must never guess whether restarting is harmless.
        // The PTY host can report its exact live-session blast radius, while Core
        // still owns in-flight filesystem and AI work. Both therefore use the
        // same explicit recovery decision instead of a timeout-triggered kill.
        await requestCoreRestart({
          service: deps.service,
          displayName: deps.displayName,
          reason: "unresponsive",
          terminalSessionCount: await getTerminalSessionCount(),
        });
      });
    }, 15000);
  }

  function stopWatchdog() {
    if (!bundledCoreWatchdog) return;
    clearInterval(bundledCoreWatchdog);
    bundledCoreWatchdog = null;
  }

  return {
    start,
    stop,
    startWatchdog,
    stopWatchdog,
  };
}
