// @vitest-environment node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface TerminalPixelResult {
  blankLitRatio: number;
  minimumScrollbackLitRatio: number;
  minimumStreamingLitRatio: number;
  minimumVisibleRowLitRatio: number;
  renderedLitRatio: number;
  retainedLineCount: number;
  scrollbackFrameCount: number;
  streamFrameCount: number;
  synchronizedRenderCount: number;
}

const RESULT_PREFIX = "AXON_TERMINAL_RENDER_RESULT:";
const require = createRequire(import.meta.url);

function runElectronPixelFixture() {
  return new Promise<TerminalPixelResult>((resolve, reject) => {
    const electronPath = require("electron") as string;
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "terminalRendererPixelFixture.cjs",
    );
    // GitHub's Ubuntu image installs Electron's chrome-sandbox without the
    // root ownership and setuid mode Chromium requires. The runner itself is an
    // isolated disposable VM and this process loads only Axon's local pixel-test
    // fixture, so disabling the Chromium process sandbox here lets the real
    // compositor test run without weakening Axon's packaged application or
    // normal developer launches. Xvfb supplies the virtual display, while
    // Electron's bundled SwiftShader lets Chromium compose the renderer in a
    // runner that has no hardware GPU and blocklists its virtual one.
    const electronArguments =
      process.platform === "linux" && process.env.CI
        ? [
            "--no-sandbox",
            "--ignore-gpu-blocklist",
            "--enable-unsafe-swiftshader",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            fixturePath,
          ]
        : [fixturePath];
    const child = spawn(electronPath, electronArguments, {
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => name !== "ELECTRON_RUN_AS_NODE",
        ),
      ),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            `Electron terminal fixture exited with ${code ?? signal}: ${stderr || stdout}`,
          ),
        );
        return;
      }
      const resultLine = stdout
        .split(/\r?\n/)
        .find((line) => line.startsWith(RESULT_PREFIX));
      if (!resultLine) {
        reject(new Error(`Electron terminal fixture returned no result: ${stdout}`));
        return;
      }
      resolve(JSON.parse(resultLine.slice(RESULT_PREFIX.length)));
    });
  });
}

describe("terminal DOM compositing", () => {
  it(
    "keeps every row of 1,200 streamed lines visible without forced redraws",
    async () => {
      const result = await runElectronPixelFixture();

      // This test intentionally asserts both halves of the regression. The
      // buffer check proves the PTY bytes reached xterm, while the pixel ratios
      // come from Electron's captured compositor output. A buffer-only test can
      // pass while the user still sees a blank terminal, which is the exact gap
      // this integration coverage is designed to close.
      expect(result.retainedLineCount).toBe(1_200);
      expect(result.streamFrameCount).toBe(8);
      expect(result.scrollbackFrameCount).toBeGreaterThanOrEqual(100);
      expect(result.minimumStreamingLitRatio).toBeGreaterThan(
        result.blankLitRatio + 0.005,
      );
      expect(result.minimumScrollbackLitRatio).toBeGreaterThan(
        result.blankLitRatio + 0.005,
      );
      expect(result.renderedLitRatio).toBeGreaterThan(
        result.blankLitRatio + 0.005,
      );
      expect(result.minimumVisibleRowLitRatio).toBeGreaterThan(0.005);
      expect(result.synchronizedRenderCount).toBeGreaterThan(2);
    },
    45_000,
  );
});
