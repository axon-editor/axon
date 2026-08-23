const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const RESULT_PREFIX = "AXON_WEBGL_RESULT:";
const STREAM_BURST_LINES = 40;
const STREAM_LINE_COUNT = 1_200;
const STREAM_WRITES_PER_FRAME = 4;
const editorRoot = path.resolve(__dirname, "../../../..");
const xtermPath = require.resolve("@xterm/xterm", { paths: [editorRoot] });
const webglAddonPath = require.resolve("@xterm/addon-webgl", {
  paths: [editorRoot],
});

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

function createVisibleOutput(start, count) {
  return Array.from({ length: count }, (_, offset) => {
    const line = String(start + offset).padStart(4, "0");
    return (
      "\x1b[47;30m" +
      ` AXON_WEBGL_RETAINED_${line} `.padEnd(60, " ") +
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
      const { WebglAddon } = require(${JSON.stringify(webglAddonPath)});
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
      const addon = new WebglAddon();
      terminal.loadAddon(addon);
      globalThis.__axonPixelTerminal = terminal;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = Array.from(document.querySelectorAll("canvas")).find(
        (candidate) => candidate.getContext("webgl2") !== null,
      );
      return { hasWebglCanvas: Boolean(canvas) };
    })()`);
    if (!setup.hasWebglCanvas) {
      throw new Error("Electron did not create an xterm WebGL2 canvas");
    }

    await waitForCompositor(window);
    const blank = await window.webContents.capturePage();

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
      rendered = await window.webContents.capturePage();
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
        if (retained.has("AXON_WEBGL_RETAINED_" + line)) count += 1;
      }
      return count;
    })()`);

    const maximumScrollLine = await window.webContents.executeJavaScript(
      "globalThis.__axonPixelTerminal.buffer.active.baseY",
    );
    let minimumScrollbackLitRatio = Number.POSITIVE_INFINITY;
    let scrollbackFrameCount = 0;
    // Every twelve-line viewport is captured, not merely a few samples from the
    // start and end. Together with the exact numbered-buffer assertion above,
    // this catches the user's failure mode where the bytes remain available but
    // one or more historical terminal pages disappear from Electron's surface.
    for (let line = 0; line <= maximumScrollLine; line += 12) {
      await window.webContents.executeJavaScript(
        `globalThis.__axonPixelTerminal.scrollToLine(${line})`,
      );
      await waitForCompositor(window);
      const page = await window.webContents.capturePage();
      minimumScrollbackLitRatio = Math.min(
        minimumScrollbackLitRatio,
        litPixelRatio(page),
      );
      scrollbackFrameCount += 1;
    }

    return {
      blankLitRatio: litPixelRatio(blank),
      minimumScrollbackLitRatio,
      minimumStreamingLitRatio,
      renderedLitRatio: litPixelRatio(rendered),
      retainedLineCount,
      scrollbackFrameCount,
      streamFrameCount: Math.ceil(
        STREAM_LINE_COUNT / (STREAM_BURST_LINES * STREAM_WRITES_PER_FRAME),
      ),
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
