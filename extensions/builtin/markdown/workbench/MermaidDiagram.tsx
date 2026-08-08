import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type MermaidRenderResult = Awaited<
  ReturnType<(typeof import("mermaid"))["default"]["render"]>
>;

let diagramSequence = 0;
let mermaidRenderQueue = Promise.resolve();

function readThemeValue(styles: CSSStyleDeclaration, name: string, fallback: string) {
  return styles.getPropertyValue(name).trim() || fallback;
}

function getMermaidTheme(container: HTMLElement) {
  const styles = getComputedStyle(container);
  const background = readThemeValue(
    styles,
    "--axon-editor-background",
    "#111318",
  );
  const panel = readThemeValue(
    styles,
    "--axon-panel-background",
    "#181b22",
  );
  const border = readThemeValue(styles, "--axon-panel-border", "#343944");
  const foreground = readThemeValue(
    styles,
    "--axon-editor-foreground",
    "#d8dee9",
  );
  const accent = readThemeValue(
    styles,
    "--axon-syntax-function",
    "#7aa2f7",
  );
  const secondary = readThemeValue(
    styles,
    "--axon-panel-overlay-hover",
    panel,
  );

  return {
    background,
    fontFamily: styles.fontFamily,
    themeVariables: {
      background,
      darkMode: styles.colorScheme.includes("dark"),
      primaryColor: panel,
      primaryTextColor: foreground,
      primaryBorderColor: border,
      secondaryColor: secondary,
      secondaryTextColor: foreground,
      secondaryBorderColor: border,
      tertiaryColor: background,
      tertiaryTextColor: foreground,
      tertiaryBorderColor: border,
      lineColor: accent,
      textColor: foreground,
      titleColor: foreground,
      edgeLabelBackground: background,
      clusterBkg: panel,
      clusterBorder: border,
      nodeBorder: border,
      mainBkg: panel,
    },
  };
}

function queueMermaidRender(
  id: string,
  source: string,
  container: HTMLElement,
) {
  const task = mermaidRenderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");
    const theme = getMermaidTheme(container);

    // Mermaid owns a module-level configuration object. Serializing renders
    // prevents two split previews with different themes from changing that
    // object while another diagram is parsing. Strict mode encodes HTML labels
    // and disables diagram click handlers, while the size/edge limits prevent a
    // malformed workspace document from monopolizing the renderer process.
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      secure: [
        "secure",
        "securityLevel",
        "startOnLoad",
        "maxTextSize",
        "maxEdges",
        "suppressErrorRendering",
      ],
      suppressErrorRendering: true,
      maxTextSize: 100_000,
      maxEdges: 500,
      theme: "base",
      fontFamily: theme.fontFamily,
      themeVariables: theme.themeVariables,
    });

    return mermaid.render(id, source);
  });
  mermaidRenderQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function getMermaidErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.trim() || "The diagram could not be rendered.";
}

export default function MermaidDiagram({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bindFunctionsRef = useRef<MermaidRenderResult["bindFunctions"]>(
    undefined,
  );
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);
  const idRef = useRef(`axon-mermaid-${++diagramSequence}`);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeRevision((revision) => revision + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      queueMermaidRender(idRef.current, source, container)
        .then((result) => {
          if (cancelled) return;
          bindFunctionsRef.current = result.bindFunctions;
          setError(null);
          setSvg(result.svg);
        })
        .catch((renderError) => {
          if (cancelled) return;
          bindFunctionsRef.current = undefined;
          setSvg("");
          setError(getMermaidErrorMessage(renderError));
        });
    }, 60);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [source, themeRevision]);

  useEffect(() => {
    if (!svg || !containerRef.current) return;
    bindFunctionsRef.current?.(containerRef.current);
  }, [svg]);

  return (
    <div className="my-5 overflow-auto rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] p-4">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 text-[12px] leading-5 text-[var(--axon-danger-foreground)]"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        aria-busy={!svg && !error}
        aria-label="Mermaid diagram"
        className={`min-h-24 min-w-0 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full ${
          svg ? "" : error ? "hidden" : "opacity-35"
        }`}
        // Mermaid's strict security level is fixed in the serialized render
        // queue above. The generated SVG must be inserted as markup because it
        // contains definitions, markers, and internal references that cannot be
        // represented as a normal React image without losing theme fidelity.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
