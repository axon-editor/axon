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
  controlSocketPath?: string | null;
  controlEnvironmentVariable?: string;
  terminalHealthPath?: string;
  preserveProcessOnHealthTimeout?: boolean;
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
  let watchdogProbeActive = false;
  let restartDeclinedUntil = 0;
  let lastReportedStatus: CoreProcessStatus | null = null;
  const expectedCoreExits = new WeakSet<ChildProcess>();

  function requestOptions(
    requestPath: string,
    headers: http.OutgoingHttpHeaders,
  ) {
    if (deps.controlSocketPath) {
      return {
        socketPath: deps.controlSocketPath,
        path: requestPath,
        headers,
      } satisfies http.RequestOptions;
    }
    return {
      hostname: "127.0.0.1",
      port: Number(deps.port),
      path: requestPath,
      headers,
    } satisfies http.RequestOptions;
  }

  function cleanupControlSocket() {
    if (!deps.controlSocketPath || process.platform === "win32") return;
    try {
      fs.rmSync(deps.controlSocketPath, { force: true });
    } catch {
      // The host may have removed its own Unix socket during a graceful exit.
    }
  }

  function reportStatus(status: CoreProcessStatus) {
    if (lastReportedStatus === status) return;
    lastReportedStatus = status;
    deps.onStatusChange?.(status);
  }

  async function getTerminalSessionCount() {
    if (!deps.terminalHealthPath) return 0;
    return new Promise<number | null>((resolve) => {
      const request = http.get(
        requestOptions(deps.terminalHealthPath!, {
          Authorization: `Bearer ${deps.token}`,
        }),
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () => {
            try {
              const snapshot = JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
              ) as {
                sessionCount?: unknown;
              };
              resolve(
                typeof snapshot.sessionCount === "number"
                  ? snapshot.sessionCount
                  : null,
              );
            } catch {
              resolve(null);
            }
          });
        },
      );
      request.once("error", () => resolve(null));
      request.setTimeout(900, () => {
        request.destroy();
        resolve(null);
      });
    });
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
          requestOptions("/health", {
            Authorization: `Bearer ${deps.token}`,
            "X-Axon-Challenge": challenge,
          }),
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
        requestOptions("/health", {
          Authorization: `Bearer ${deps.token}`,
          "X-Axon-Challenge": challenge,
        }),
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
    cleanupControlSocket();
    const child = spawn(servicePath, [], {
      env: {
        ...process.env,
        [deps.portEnvironmentVariable]: deps.port,
        [deps.tokenEnvironmentVariable]: deps.token,
        ...(deps.controlSocketPath && deps.controlEnvironmentVariable
          ? { [deps.controlEnvironmentVariable]: deps.controlSocketPath }
          : {}),
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
    cleanupControlSocket();
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
      if (bundledCoreRestarting || watchdogProbeActive) return;

      watchdogProbeActive = true;
      void waitForAxonCore(1200)
        .then(async (healthy) => {
          if (healthy) {
            bundledCoreHealthFailures = 0;
            reportStatus("healthy");
            return;
          }

          bundledCoreHealthFailures += 1;
          if (bundledCoreHealthFailures < 3) return;
          bundledCoreHealthFailures = 0;
          reportStatus("unresponsive");

          if (deps.preserveProcessOnHealthTimeout) {
            // A terminal host can miss a short control-plane probe while several
            // PTYs are simultaneously producing output. Its child-process exit
            // event is the authoritative crash signal; restarting a process that
            // is still alive would terminate every shell in every Axon window.
            // I therefore keep probing and let the existing WebSockets recover
            // naturally. A real host exit still follows the explicit crash path
            // above, where the sessions have already ended and restart is safe.
            console.warn(
              `${deps.displayName} missed repeated health probes; preserving the running process and terminal sessions`,
            );
            return;
          }

          // A service supervisor must never guess whether restarting is harmless.
          // Core owns in-flight filesystem and AI work, so it uses an explicit
          // recovery decision instead of a timeout-triggered kill.
          await requestCoreRestart({
            service: deps.service,
            displayName: deps.displayName,
            reason: "unresponsive",
            terminalSessionCount: await getTerminalSessionCount(),
          });
        })
        .finally(() => {
          watchdogProbeActive = false;
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
