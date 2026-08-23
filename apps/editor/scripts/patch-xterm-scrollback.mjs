import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const xtermCommonJsPath = require.resolve("@xterm/xterm");
const xtermModuleDirectory = path.dirname(xtermCommonJsPath);
const xtermRuntimePaths = [
  xtermCommonJsPath,
  path.join(xtermModuleDirectory, "xterm.mjs"),
];

const brokenScrollUp =
  "scrollUp(e){let t=e.params[0]||1;for(;t--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}";

const fixedScrollUp =
  "scrollUp(e){let t=e.params[0]||1;if(0===this._activeBuffer.scrollTop)for(;t--;){const e=this._activeBuffer.ybase;this._bufferService.scroll(this._eraseAttrData()),this._activeBuffer.savedY+=this._activeBuffer.ybase-e}else for(;t--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}";

for (const runtimePath of xtermRuntimePaths) {
  const runtime = await readFile(runtimePath, "utf8");
  if (runtime.includes(fixedScrollUp)) {
    continue;
  }
  if (!runtime.includes(brokenScrollUp)) {
    throw new Error(
      `Cannot patch ${runtimePath}: the installed xterm scrollUp implementation changed. Review the dependency before building Axon.`,
    );
  }

  // Interactive terminal programs can use CSI S to move a top-anchored scroll
  // region while keeping controls fixed at the bottom. xterm currently deletes
  // those departing rows, so output from any shell, agent, multiplexer, or TUI
  // using that ANSI sequence disappears when it crosses the live region's top.
  // This is the built form of xtermjs/xterm.js#6011: route top-anchored scrolling
  // through BufferService.scroll so the row enters scrollback exactly as it does
  // for a linefeed at the bottom margin.
  await writeFile(runtimePath, runtime.replace(brokenScrollUp, fixedScrollUp));
  console.log(`patched xterm scrollback retention in ${runtimePath}`);
}
