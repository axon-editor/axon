const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const RESULT_PREFIX = "AXON_TERMINAL_RENDER_RESULT:";
const STREAM_BURST_LINES = 40;
const STREAM_LINE_COUNT = 1_200;
const STREAM_WRITES_PER_FRAME = 4;
const editorRoot = path.resolve(__dirname, "../../../..");
const xtermPath = require.resolve("@xterm/xterm", { paths: [editorRoot] });

function litPixelRatio(image) {
  const bitmap = image.toBitmap();
  let litPixels = 0;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    // Electron's native bitmap channel order is platform-dependent, but the
    // terminal uses a black background and white foreground. Inspecting all
    // three color channels makes this assertion portable across macOS, Linux,
    // and Windows while still measuring actual composited glyph pixels.
    if (
      bitmap[offset] > 40 ||
      bitmap[offset + 1] > 40 ||
      bitmap[offset + 2] > 40
    ) {
      litPixels += 1;
    }
  }
  return litPixels / (bitmap.length / 4);
}

function rowLitPixelRatios(image, rowCount) {
  const bitmap = image.toBitmap();
  const { width, height } = image.getSize();
  const litPixels = Array.from({ length: rowCount }, () => 0);
  const pixelCounts = Array.from({ length: rowCount }, () => 0);

  for (let y = 0; y < height; y += 1) {
    const row = Math.min(rowCount - 1, Math.floor((y * rowCount) / height));
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixelCounts[row] += 1;
      if (
        bitmap[offset] > 40 ||
        bitmap[offset + 1] > 40 ||
        bitmap[offset + 2] > 40
      ) {
        litPixels[row] += 1;
      }
    }
  }

  return litPixels.map((count, row) => count / pixelCounts[row]);
}

function createVisibleOutput(start, count) {
  return Array.from({ length: count }, (_, offset) => {
    const line = String(start + offset).padStart(4, "0");
    return (
      "\x1b[97m" +
      ` AXON_RENDER_RETAINED_${line} `.padEnd(60, " ") +
      "\x1b[0m\r\n"
    );
  }).join("");
}

async function waitForCompositor(window) {
  await window.webContents.executeJavaScript(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  // Offscreen BrowserWindows only publish a new NativeImage after their paint
  // loop observes the damaged frame. Invalidating here makes the fixture wait
  // for Chromium's compositor, not merely xterm's JavaScript write callback.
  window.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function captureTerminalScreen(window, screenBounds) {
  return window.webContents.capturePage(screenBounds);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 820,
    height: 360,
    backgroundColor: "#000000",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      offscreen: true,
      sandbox: false,
    },
  });

  try {
    const html = `<!doctype html>
      <html>
        <body style="margin:0;background:#000;overflow:hidden">
          <div id="terminal" style="width:800px;height:340px;padding:8px"></div>
        </body>
      </html>`;
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const setup = await window.webContents.executeJavaScript(`(async () => {
      const { Terminal } = require(${JSON.stringify(xtermPath)});
      const terminal = new Terminal({
        cols: 80,
        rows: 12,
        cursorBlink: false,
        disableStdin: true,
        fontFamily: "monospace",
        fontSize: 18,
        scrollback: 200000,
        theme: { background: "#000000", foreground: "#ffffff" },
      });
      terminal.open(document.getElementById("terminal"));
      globalThis.__axonPixelTerminal = terminal;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise((resolve) => terminal.write("\\x1b[?25l", resolve));
      const screenBounds = document.querySelector(".xterm-screen").getBoundingClientRect();
      return {
        hasRenderedRows: Boolean(document.querySelector(".xterm-rows")),
        screenBounds: {
          x: Math.floor(screenBounds.x),
          y: Math.floor(screenBounds.y),
          width: Math.ceil(screenBounds.width),
          height: Math.ceil(screenBounds.height),
        },
      };
    })()`);
    if (!setup.hasRenderedRows) {
      throw new Error("Electron did not create xterm's DOM renderer rows");
    }

    await waitForCompositor(window);
    const blank = await captureTerminalScreen(window, setup.screenBounds);

    let minimumStreamingLitRatio = Number.POSITIVE_INFINITY;
    let rendered = blank;
    for (
      let start = 0;
      start < STREAM_LINE_COUNT;
      start += STREAM_BURST_LINES * STREAM_WRITES_PER_FRAME
    ) {
      const outputs = Array.from(
        { length: STREAM_WRITES_PER_FRAME },
        (_, writeIndex) => {
          const writeStart = start + writeIndex * STREAM_BURST_LINES;
          const remaining = STREAM_LINE_COUNT - writeStart;
          return createVisibleOutput(
            writeStart,
            Math.max(0, Math.min(STREAM_BURST_LINES, remaining)),
          );
        },
      ).filter(Boolean);
      await window.webContents.executeJavaScript(`
        Promise.all(
          ${JSON.stringify(outputs)}.map(
            (output) => new Promise((resolve) =>
              globalThis.__axonPixelTerminal.write(output, resolve),
            ),
          ),
        )
      `);
      await waitForCompositor(window);
      rendered = await captureTerminalScreen(window, setup.screenBounds);
      minimumStreamingLitRatio = Math.min(
        minimumStreamingLitRatio,
        litPixelRatio(rendered),
      );
    }

    const retainedLineCount = await window.webContents.executeJavaScript(`(() => {
      const buffer = globalThis.__axonPixelTerminal.buffer.active;
      const retained = new Set(
        Array.from({ length: buffer.length }, (_, index) =>
          buffer.getLine(index)?.translateToString(true).trim() ?? "",
        ),
      );
      let count = 0;
      for (let index = 0; index < ${STREAM_LINE_COUNT}; index += 1) {
        const line = String(index).padStart(4, "0");
        if (retained.has("AXON_RENDER_RETAINED_" + line)) count += 1;
      }
      return count;
    })()`);

    const maximumScrollLine = await window.webContents.executeJavaScript(
      "globalThis.__axonPixelTerminal.buffer.active.baseY",
    );
    let minimumScrollbackLitRatio = Number.POSITIVE_INFINITY;
    let minimumVisibleRowLitRatio = Number.POSITIVE_INFINITY;
    let scrollbackFrameCount = 0;
    // Every twelve-line viewport is captured, not merely a few samples from the
    // start and end. Together with the exact numbered-buffer assertion above,
    // this catches the user's failure mode where the bytes remain available but
    // one or more historical terminal pages disappear from Electron's surface.
    for (let line = 0; line <= maximumScrollLine; line += 12) {
      const visibleLines = await window.webContents.executeJavaScript(`(() => {
        const terminal = globalThis.__axonPixelTerminal;
        terminal.scrollToLine(${line});
        const buffer = terminal.buffer.active;
        return Array.from({ length: terminal.rows }, (_, row) =>
          buffer.getLine(buffer.viewportY + row)?.translateToString(true).trim() ?? "",
        );
      })()`);
      await waitForCompositor(window);
      const page = await captureTerminalScreen(window, setup.screenBounds);
      minimumScrollbackLitRatio = Math.min(
        minimumScrollbackLitRatio,
        litPixelRatio(page),
      );
      const rowRatios = rowLitPixelRatios(page, visibleLines.length);
      for (let row = 0; row < visibleLines.length; row += 1) {
        if (!visibleLines[row]) continue;
        minimumVisibleRowLitRatio = Math.min(
          minimumVisibleRowLitRatio,
          rowRatios[row],
        );
      }
      scrollbackFrameCount += 1;
    }

    const synchronizedRenderCount =
      await window.webContents.executeJavaScript(`new Promise((resolve) => {
        const terminal = globalThis.__axonPixelTerminal;
        let frame = 0;
        let renderCount = 0;
        const renderDisposable = terminal.onRender(() => {
          renderCount += 1;
        });
        const deadline = performance.now() + 250;

        // Agent TUIs use DEC mode 2026 to publish each completed screen update
        // atomically. Queueing the next synchronized frame from xterm's write
        // callback recreates a continuous agent stream: the parser completes
        // one frame, requests its paint, and immediately receives the opening
        // marker for the next frame. The renderer must commit completed frames
        // here instead of allowing every queued animation frame to be skipped
        // until the protocol's one-second safety timeout fires.
        const writeNextFrame = () => {
          const line = String(frame).padStart(5, "0");
          const output =
            "\\x1b[?2026h\\x1b[H\\x1b[48;2;42;42;42m\\x1b[97m" +
            (" AXON_SYNC_FRAME_" + line + " ").padEnd(60, " ") +
            "\\x1b[0m\\x1b[?2026l";
          terminal.write(output, () => {
            frame += 1;
            if (performance.now() < deadline) {
              writeNextFrame();
              return;
            }
            renderDisposable.dispose();
            resolve(renderCount);
          });
        };
        writeNextFrame();
      })`);

    return {
      blankLitRatio: litPixelRatio(blank),
      minimumScrollbackLitRatio,
      minimumStreamingLitRatio,
      minimumVisibleRowLitRatio,
      renderedLitRatio: litPixelRatio(rendered),
      retainedLineCount,
      scrollbackFrameCount,
      streamFrameCount: Math.ceil(
        STREAM_LINE_COUNT / (STREAM_BURST_LINES * STREAM_WRITES_PER_FRAME),
      ),
      synchronizedRenderCount,
    };
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  try {
    const result = await run();
    process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`);
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error?.stack ?? String(error)}\n`);
    app.exit(1);
  }
});
