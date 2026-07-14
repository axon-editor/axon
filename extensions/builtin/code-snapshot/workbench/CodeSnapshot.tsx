import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { editorFontStack } from "@axon-editor/renderer/shared/lib/fonts";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import { type ExtensionThemeSyntaxStyle } from "@axon-editor/shared/extensions";
import { type EditorSettings } from "@axon-editor/shared/settings";
import {
  CodeSnapshotControls,
  type SnapshotPaletteOption,
} from "./CodeSnapshotControls";
import { getCodeSnapshotSource } from "./lib/codeSnapshotTabs";
import { renderCodeSnapshot } from "./lib/renderCodeSnapshot";

const MAX_SNAPSHOT_LINES = 160;

const palettes: SnapshotPaletteOption[] = [
  {
    id: "graphite",
    label: "Graphite",
    background: "#0d1117",
    header: "#161b22",
    border: "#30363d",
    foreground: "#d8dee9",
    lineNumber: "#667085",
  },
  {
    id: "paper",
    label: "Paper",
    background: "#f7f8fa",
    header: "#eceff3",
    border: "#c9d0da",
    foreground: "#1f2937",
    lineNumber: "#8791a1",
  },
  {
    id: "forest",
    label: "Forest",
    background: "#101713",
    header: "#17211b",
    border: "#314438",
    foreground: "#d5e2d9",
    lineNumber: "#718578",
  },
  {
    id: "plum",
    label: "Plum",
    background: "#18121c",
    header: "#211827",
    border: "#44334c",
    foreground: "#e3d8e8",
    lineNumber: "#8d7896",
  },
];

function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? "code";
}

function pngName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim() || "code";
  return `${base}-snapshot.png`;
}

export default function CodeSnapshot({
  editorSettings,
  tabPath,
  themeSyntax,
  themeTokens,
}: {
  editorSettings: EditorSettings;
  tabPath: string;
  themeSyntax: Record<string, ExtensionThemeSyntaxStyle>;
  themeTokens: ResolvedThemeTokens;
}) {
  const source = getCodeSnapshotSource(tabPath);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const totalLines = source?.content.split("\n").length ?? 1;
  const [startLine, setStartLine] = useState(source?.startLine ?? 1);
  const [endLine, setEndLine] = useState(source?.endLine ?? 1);
  const [fileName, setFileName] = useState(
    source ? fileNameFromPath(source.filePath) : "code",
  );
  const [fontSize, setFontSize] = useState(
    Math.min(32, Math.max(18, editorSettings.fontSize + 5)),
  );
  const [padding, setPadding] = useState(48);
  const [width, setWidth] = useState(1040);
  const [showFileName, setShowFileName] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [paletteId, setPaletteId] = useState("theme");
  const [copied, setCopied] = useState(false);
  const [renderReady, setRenderReady] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const paletteOptions = useMemo<SnapshotPaletteOption[]>(
    () => [
      {
        id: "theme",
        label: "Axon theme",
        background: themeTokens["editor.background"],
        header: themeTokens["panel.background"],
        border: themeTokens["panel.border"],
        foreground: themeTokens["editor.foreground"],
        lineNumber: themeTokens["syntax.comment"],
      },
      ...palettes,
    ],
    [themeTokens],
  );
  const palette =
    paletteOptions.find((candidate) => candidate.id === paletteId) ??
    paletteOptions[0];

  const normalizedRange = useMemo(() => {
    const start = Math.max(1, Math.min(totalLines, Math.floor(startLine) || 1));
    const requestedEnd = Math.max(
      start,
      Math.min(totalLines, Math.floor(endLine) || start),
    );
    return {
      start,
      end: Math.min(requestedEnd, start + MAX_SNAPSHOT_LINES - 1),
    };
  }, [endLine, startLine, totalLines]);

  const code = useMemo(() => {
    if (!source) return "";
    return source.content
      .split("\n")
      .slice(normalizedRange.start - 1, normalizedRange.end)
      .join("\n");
  }, [normalizedRange.end, normalizedRange.start, source]);

  useEffect(() => {
    if (!source || !canvasRef.current) return;
    let cancelled = false;
    setRenderReady(false);
    void renderCodeSnapshot(canvasRef.current, {
      code,
      fileName,
      fontFamily: editorFontStack(editorSettings.fontFamily),
      fontSize,
      languageId: source.languageId,
      padding,
      palette,
      showFileName,
      showLineNumbers,
      startLine: normalizedRange.start,
      tabSize: editorSettings.tabSize,
      themeSyntax,
      themeTokens,
      width,
    })
      .then(() => {
        if (!cancelled) setRenderReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setExportError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [
    code,
    editorSettings.fontFamily,
    editorSettings.tabSize,
    fileName,
    fontSize,
    normalizedRange.start,
    padding,
    palette,
    showFileName,
    showLineNumbers,
    source,
    themeSyntax,
    themeTokens,
    width,
  ]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const getPngData = () => {
    const canvas = canvasRef.current;
    if (!canvas || !renderReady) {
      throw new Error("The snapshot preview is not ready.");
    }
    return canvas.toDataURL("image/png");
  };

  const copyPng = async () => {
    setExportError(null);
    try {
      await window.axon.copyImage(getPngData());
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  };

  const savePng = async () => {
    setExportError(null);
    try {
      await window.axon.saveCodeSnapshot(pngName(fileName), getPngData());
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  };

  if (!source) {
    return (
      <div className="grid h-full place-items-center bg-[var(--axon-editor-background)] text-[var(--axon-editor-foreground)]">
        <div className="text-center opacity-60">
          <ImageOff className="mx-auto mb-3" size={24} />
          <p className="text-[13px]">
            This snapshot source is no longer available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-[var(--axon-editor-background)] text-[var(--axon-editor-foreground)]">
      <CodeSnapshotControls
        copied={copied}
        endLine={normalizedRange.end}
        fileName={fileName}
        fontSize={fontSize}
        onCopy={() => void copyPng()}
        onEndLineChange={setEndLine}
        onFileNameChange={setFileName}
        onFontSizeChange={setFontSize}
        onPaddingChange={setPadding}
        onPaletteChange={setPaletteId}
        onSave={() => void savePng()}
        onShowFileNameChange={setShowFileName}
        onShowLineNumbersChange={setShowLineNumbers}
        onStartLineChange={(value) => {
          const next = Math.max(1, Math.min(totalLines, value || 1));
          setStartLine(next);
          if (endLine < next) setEndLine(next);
        }}
        onWidthChange={setWidth}
        padding={padding}
        paletteId={paletteId}
        palettes={paletteOptions}
        renderReady={renderReady}
        showFileName={showFileName}
        showLineNumbers={showLineNumbers}
        startLine={normalizedRange.start}
        width={width}
      />

      <main className="min-w-0 flex-1 overflow-auto bg-[#090c11] p-8">
        <div className="flex min-h-full min-w-fit items-center justify-center">
          <canvas
            ref={canvasRef}
            aria-label="Code snapshot preview"
            className="block max-w-[calc(100vw-24rem)] shadow-[0_24px_80px_rgba(0,0,0,0.48)]"
          />
        </div>
        {exportError ? (
          <div className="fixed bottom-5 right-5 max-w-md rounded border border-[#7d3840] bg-[#2a1519] px-3 py-2 text-[12px] text-[#f0a7ae] shadow-xl">
            {exportError}
          </div>
        ) : null}
      </main>
    </div>
  );
}
