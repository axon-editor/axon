import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import { ExternalLink } from "lucide-react";
import {
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import "katex/dist/katex.min.css";
import MermaidDiagram from "./MermaidDiagram";
import HighlightedCodeBlock from "./HighlightedCodeBlock";
import {
  FrontmatterPanel,
  MarkdownCallout,
  MarkdownReferences,
} from "./MarkdownDocumentExtras";
import MarkdownPreviewToolbar from "./MarkdownPreviewToolbar";
import {
  prepareMarkdownDocument,
  remarkAxonCallouts,
  remarkAxonSafeMdx,
  remarkAxonSourceLines,
  remarkAxonWikiLinksAndCitations,
  remarkHideFrontmatter,
  toggleMarkdownTask,
} from "./lib/markdownDocument";
import {
  onMarkdownScroll,
  publishMarkdownScroll,
} from "./lib/markdownPreviewSync";
import { markdownSanitizeSchema } from "./lib/markdownSanitize";

interface MarkdownPreviewProps {
  content: string;
  filePath: string;
  folderPath: string | null;
  onOpenFile?: (path: string) => void;
  onContentChange?: (content: string) => void;
}

const MARKDOWN_REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema] as [
    typeof rehypeSanitize,
    typeof markdownSanitizeSchema,
  ],
  rehypeKatex,
];
const MARKDOWN_REMARK_PLUGINS = [
  remarkFrontmatter,
  remarkGfm,
  remarkMath,
  remarkAxonCallouts,
  remarkAxonWikiLinksAndCitations,
  remarkAxonSourceLines,
  remarkHideFrontmatter,
];
const MDX_REMARK_PLUGINS = [
  remarkFrontmatter,
  remarkGfm,
  remarkMath,
  remarkMdx,
  remarkAxonCallouts,
  remarkAxonWikiLinksAndCitations,
  remarkAxonSafeMdx,
  remarkAxonSourceLines,
  remarkHideFrontmatter,
];
const TaskLineContext = createContext<number | null>(null);

function getParentPath(filePath: string) {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  return separatorIndex > 0 ? filePath.slice(0, separatorIndex) : "";
}

function normalizePath(path: string) {
  const parts: string[] = [];

  path.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      parts.pop();
      return;
    }
    parts.push(part);
  });

  return `/${parts.join("/")}`;
}

function isExternalUrl(src: string) {
  return /^(https?:|mailto:|tel:)/i.test(src);
}

function isInlineReference(src: string) {
  return /^(#|data:|blob:)/i.test(src);
}

function isHashReference(src: string) {
  return src.startsWith("#");
}

function encodeLocalPath(path: string) {
  return path
    .split("/")
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join("/");
}

function splitLocalReference(src: string) {
  const markerIndex = src.search(/[?#]/);
  if (markerIndex === -1) return { pathname: src, suffix: "" };

  return {
    pathname: src.slice(0, markerIndex),
    suffix: src.slice(markerIndex),
  };
}

function resolveMarkdownAsset(
  src: string | undefined,
  filePath: string,
  folderPath: string | null,
) {
  if (!src || isExternalUrl(src) || isInlineReference(src)) return src;

  const { pathname, suffix } = splitLocalReference(src);
  const markdownRoot = folderPath ?? getParentPath(filePath);

  // Markdown images are normally written relative to the Markdown file, not
  // relative to the app bundle. A leading slash means "from the opened
  // workspace root" in project docs, while dot-relative paths stay next to the
  // Markdown file. Both forms are converted into axon://local URLs so Electron
  // can serve local assets without exposing file:// directly to the renderer.
  const absolutePath = pathname.startsWith("/")
    ? normalizePath(`${markdownRoot}/${pathname}`)
    : normalizePath(`${getParentPath(filePath)}/${pathname}`);

  return `axon://local${encodeLocalPath(absolutePath)}${suffix}`;
}

function isVideoAsset(src: string | undefined) {
  if (!src) return false;
  const { pathname } = splitLocalReference(src);
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(pathname);
}

function resolveMarkdownLinkPath(
  href: string | undefined,
  filePath: string,
  folderPath: string | null,
) {
  if (!href || isExternalUrl(href) || isInlineReference(href)) return null;

  const { pathname } = splitLocalReference(href);
  if (!pathname) return null;
  const markdownRoot = folderPath ?? getParentPath(filePath);

  return pathname.startsWith("/")
    ? normalizePath(`${markdownRoot}/${pathname}`)
    : normalizePath(`${getParentPath(filePath)}/${pathname}`);
}

function createHeadingSlug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeHeadingAnchor(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getDecodedHash(hash: string) {
  const rawHash = hash.replace(/^#/, "");
  try {
    return decodeURIComponent(rawHash);
  } catch {
    return rawHash;
  }
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }

  return "";
}

function getClassNameFromNode(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    return node.map(getClassNameFromNode).find(Boolean);
  }

  if (isValidElement<{ className?: string; children?: ReactNode }>(node)) {
    const props = node.props;
    return props?.className ?? getClassNameFromNode(props?.children);
  }

  return undefined;
}

function getCodeLanguage(className?: string) {
  return /language-([\w-]+)/.exec(className ?? "")?.[1]?.toLowerCase() ?? "text";
}

function getStyleObject(style: unknown): CSSProperties {
  if (typeof style === "string") {
    return style
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .reduce<CSSProperties>((styles, declaration) => {
        const separatorIndex = declaration.indexOf(":");
        if (separatorIndex === -1) return styles;

        const property = declaration
          .slice(0, separatorIndex)
          .trim()
          .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
        const value = declaration.slice(separatorIndex + 1).trim();
        if (!property || !value) return styles;

        return {
          ...styles,
          [property]: value,
        };
      }, {});
  }
  if (!style || typeof style !== "object") return {};
  return style as CSSProperties;
}

function getTextAlign(props: any): CSSProperties["textAlign"] {
  if (props.align) return props.align;
  if (typeof props.style?.textAlign === "string") return props.style.textAlign;
  if (typeof props.style === "string") {
    const match = /text-align\s*:\s*([^;]+)/i.exec(props.style);
    return match?.[1]?.trim() as CSSProperties["textAlign"];
  }
  return undefined;
}

function getFlowStyle(props: any): CSSProperties {
  return {
    ...getStyleObject(props.style),
    textAlign: getTextAlign(props),
  };
}

function sourceLineFromProps(props: Record<string, unknown>) {
  const line = props["data-source-line"];
  return typeof line === "number" || typeof line === "string"
    ? { "data-source-line": line }
    : {};
}

function TaskCheckbox({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: (line: number, checked: boolean) => void;
}) {
  const line = useContext(TaskLineContext);
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!line}
      onChange={(event) => line && onToggle(line, event.currentTarget.checked)}
      className="mr-2 translate-y-[1px] cursor-pointer accent-[var(--axon-syntax-function)] disabled:cursor-default"
    />
  );
}

export default function MarkdownPreview({
  content,
  filePath,
  folderPath,
  onOpenFile,
  onContentChange,
}: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef(content);
  const scrollFrameRef = useRef<number | null>(null);
  const suppressPreviewScrollRef = useRef(false);
  const headingSlugCounts = useRef(new Map<string, number>());
  const preparedDocument = useMemo(
    () => prepareMarkdownDocument(content),
    [content],
  );
  const remarkPlugins = filePath.toLowerCase().endsWith(".mdx")
    ? MDX_REMARK_PLUGINS
    : MARKDOWN_REMARK_PLUGINS;
  contentRef.current = content;
  headingSlugCounts.current.clear();

  useEffect(
    () =>
      onMarkdownScroll((event) => {
        if (event.filePath !== filePath || event.source !== "editor") return;
        const preview = previewRef.current;
        if (!preview) return;
        const sourceBlocks = Array.from(
          preview.querySelectorAll<HTMLElement>("[data-source-line]"),
        );
        const target = sourceBlocks.reduce<HTMLElement | null>((closest, block) => {
          const line = Number(block.dataset.sourceLine);
          if (!Number.isFinite(line) || line > event.line) return closest;
          if (!closest) return block;
          return Number(closest.dataset.sourceLine) < line ? block : closest;
        }, null);
        if (!target) return;

        // Both panes publish scroll updates. The suppression flag covers the
        // programmatic preview scroll through its next animation frame so one
        // pane cannot continuously bounce tiny layout differences back to the
        // other and make synchronized scrolling feel unstable.
        suppressPreviewScrollRef.current = true;
        preview.scrollTop = Math.max(0, target.offsetTop - 16);
        window.requestAnimationFrame(() => {
          suppressPreviewScrollRef.current = false;
        });
      }),
    [filePath],
  );

  const handlePreviewScroll = useCallback(() => {
    if (suppressPreviewScrollRef.current || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const preview = previewRef.current;
      if (!preview) return;
      const viewportTop = preview.getBoundingClientRect().top + 20;
      const blocks = Array.from(
        preview.querySelectorAll<HTMLElement>("[data-source-line]"),
      );
      const visibleBlock = blocks.find(
        (block) => block.getBoundingClientRect().bottom >= viewportTop,
      );
      const line = Number(visibleBlock?.dataset.sourceLine);
      if (Number.isFinite(line)) {
        publishMarkdownScroll({ filePath, line, source: "preview" });
      }
    });
  }, [filePath]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const handleTaskToggle = useCallback(
    (line: number, checked: boolean) => {
      const currentContent = contentRef.current;
      const nextContent = toggleMarkdownTask(currentContent, line, checked);
      if (nextContent !== currentContent) onContentChange?.(nextContent);
    },
    [onContentChange],
  );

  const getHeadingId = useCallback(
    (children: ReactNode, providedId?: string) => {
      if (providedId) return providedId;

      const baseSlug = createHeadingSlug(textFromNode(children));
      if (!baseSlug) return undefined;

      const count = headingSlugCounts.current.get(baseSlug) ?? 0;
      headingSlugCounts.current.set(baseSlug, count + 1);
      return count === 0 ? baseSlug : `${baseSlug}-${count}`;
    },
    [],
  );

  const scrollToMarkdownHash = useCallback((hash: string) => {
    const preview = previewRef.current;
    if (!preview) return false;

    const decodedHash = getDecodedHash(hash);
    if (!decodedHash) {
      preview.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    }

    const slugHash = createHeadingSlug(decodedHash);
    const targetIds = Array.from(
      new Set([decodedHash, slugHash].filter(Boolean)),
    );
    const normalizedTargetIds = targetIds.map(normalizeHeadingAnchor);
    const target = Array.from(
      preview.querySelectorAll<HTMLElement>("[id]"),
    ).find((element) => {
      if (targetIds.includes(element.id)) return true;

      // Generated tables of contents are not perfectly consistent about
      // punctuation. A heading like "Returns immediately — no processing
      // delay." may be linked as either `returns-immediately-no-processing-
      // delay` or `returns-immediately--no-processing-delay` depending on
      // whether the authoring tool removes the em dash before or after
      // spacing is collapsed. Comparing a normalized anchor form here keeps
      // those links working without changing the visible heading ids that
      // existing Markdown files may already reference.
      return normalizedTargetIds.includes(normalizeHeadingAnchor(element.id));
    });

    if (!target) return false;

    // Anchor links should behave like documentation sites: a table of contents
    // click moves the preview pane, not the whole Electron document. Scoping
    // the lookup to this preview container also prevents split Markdown panes
    // from stealing each other's in-page navigation.
    target.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
    return true;
  }, []);

  const handleLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string | undefined) => {
      if (!href) return;
      if (isHashReference(href)) {
        event.preventDefault();
        scrollToMarkdownHash(href);
        return;
      }
      if (/^(data:|blob:)/i.test(href)) {
        event.preventDefault();
        return;
      }
      if (isInlineReference(href)) return;
      event.preventDefault();

      if (isExternalUrl(href)) {
        void window.axon.openExternalLink(href);
        return;
      }

      const { suffix } = splitLocalReference(href);
      const targetPath = resolveMarkdownLinkPath(href, filePath, folderPath);
      if (
        targetPath &&
        normalizePath(targetPath) === normalizePath(filePath) &&
        suffix.startsWith("#")
      ) {
        scrollToMarkdownHash(suffix);
        return;
      }

      if (targetPath && onOpenFile) {
        onOpenFile(targetPath);
      }
    },
    [filePath, folderPath, onOpenFile, scrollToMarkdownHash],
  );

  const markdownComponents = useMemo<Components>(
    () => ({
      h1: ({ children, id, ...props }: any) => (
        <h1
          id={getHeadingId(children, id)}
          {...sourceLineFromProps(props)}
          className="scroll-mt-4 mb-5 border-b border-[var(--axon-panel-border)] pb-3 text-[26px] font-semibold leading-tight text-[var(--axon-editor-foreground)]"
        >
          {children}
        </h1>
      ),
      h2: ({ children, id, ...props }: any) => (
        <h2
          id={getHeadingId(children, id)}
          {...sourceLineFromProps(props)}
          className="scroll-mt-4 mb-3 mt-8 border-b border-[var(--axon-panel-border)] pb-2 text-[20px] font-semibold leading-tight text-[var(--axon-editor-foreground)]"
        >
          {children}
        </h2>
      ),
      h3: ({ children, id, ...props }: any) => (
        <h3
          id={getHeadingId(children, id)}
          {...sourceLineFromProps(props)}
          className="scroll-mt-4 mb-2 mt-6 text-[16px] font-semibold leading-tight text-[var(--axon-editor-foreground)]"
        >
          {children}
        </h3>
      ),
      h4: ({ children, id, ...props }: any) => (
        <h4
          id={getHeadingId(children, id)}
          {...sourceLineFromProps(props)}
          className="scroll-mt-4 mb-2 mt-5 text-[14px] font-semibold leading-tight text-[var(--axon-editor-foreground)]"
        >
          {children}
        </h4>
      ),
      p: ({ children, ...props }: any) => (
        <p
          className="my-4"
          style={getFlowStyle(props)}
          {...sourceLineFromProps(props)}
        >
          {children}
        </p>
      ),
      center: ({ children, ...props }: any) => (
        <div style={{ ...getFlowStyle(props), textAlign: "center" }}>
          {children}
        </div>
      ),
      div: ({ children, ...props }: any) => {
        const componentName = props["data-mdx-component"];
        return (
          <div
            style={getFlowStyle(props)}
            {...sourceLineFromProps(props)}
            className={
              componentName
                ? "my-4 border-l-2 border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-4 py-3"
                : undefined
            }
          >
            {componentName ? (
              <div className="mb-2 text-[10px] font-semibold uppercase text-[var(--axon-syntax-function)]">
                {componentName}
              </div>
            ) : null}
            {children}
          </div>
        );
      },
      aside: ({ children, ...props }: any) => (
        <MarkdownCallout kind={props["data-callout"]}>{children}</MarkdownCallout>
      ),
      details: ({ children, ...props }: any) => (
        <details
          open={props.open}
          className="my-4 rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-4 py-3"
        >
          {children}
        </details>
      ),
      summary: ({ children }) => (
        <summary className="cursor-pointer font-medium text-[var(--axon-editor-foreground)]">
          {children}
        </summary>
      ),
      span: ({ children, node: _node, ...props }: any) =>
        props["data-mdx-badge"] ? (
          <span className="inline-flex rounded border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--axon-syntax-function)]">
            {children}
          </span>
        ) : (
          // KaTeX renders its layout as nested spans with generated classes and
          // inline measurements. Preserving those ordinary span properties is
          // required for fractions, superscripts, and display equations to keep
          // their geometry after ReactMarkdown hands them to this component map.
          <span {...props}>{children}</span>
        ),
      a: ({ children, href, ...props }: any) => (
        <a
          href={
            isExternalUrl(href ?? "") || isInlineReference(href ?? "")
              ? href
              : (resolveMarkdownLinkPath(href, filePath, folderPath) ?? href)
          }
          onClick={(event) => handleLinkClick(event, href)}
          rel="noreferrer"
          data-citation={props["data-citation"]}
          data-wiki-link={props["data-wiki-link"]}
          data-footnote-ref={props["data-footnote-ref"]}
          data-footnote-backref={props["data-footnote-backref"]}
          aria-describedby={props["aria-describedby"]}
          aria-label={props["aria-label"]}
          className="inline-flex items-center gap-1 text-[var(--axon-syntax-function)] underline-offset-4 hover:underline"
        >
          {children}
          {href && isExternalUrl(href) && <ExternalLink size={11} />}
        </a>
      ),
      blockquote: ({ children, ...props }: any) =>
        props["data-callout"] ? (
          <MarkdownCallout kind={props["data-callout"]}>{children}</MarkdownCallout>
        ) : (
          <blockquote
            {...sourceLineFromProps(props)}
            className="my-2 border-l-[3px] border-[var(--axon-panel-border)] bg-transparent py-0.5 pl-3 pr-2 text-[13px] leading-6 text-[var(--axon-editor-foreground)] opacity-55 [&>p]:my-0 [&>p+p]:mt-2"
          >
            {children}
          </blockquote>
        ),
      code: ({ children, ...props }: any) => (
        <code
          className="rounded bg-[var(--axon-panel-overlay-hover)] px-1.5 py-0.5 text-[13px] text-[var(--axon-syntax-function)]"
          {...props}
        >
          {children}
        </code>
      ),
      pre: ({ children, ...props }: any) => {
        // React Markdown no longer gives a dependable `inline` flag in
        // every renderer path. Treating `pre` as the only fenced-code
        // entry point prevents single-backtick text like `7777` from
        // being mistaken for a full GitHub-style code block.
        const className = getClassNameFromNode(children);
        const source = textFromNode(children).replace(/\n$/, "");
        if (["mermaid", "mmd"].includes(getCodeLanguage(className))) {
          return (
            <div {...sourceLineFromProps(props)}>
              <MermaidDiagram source={source} />
            </div>
          );
        }

        return (
          <div {...sourceLineFromProps(props)}>
            <HighlightedCodeBlock language={getCodeLanguage(className)}>
              {source}
            </HighlightedCodeBlock>
          </div>
        );
      },
      img: ({ src, alt, width, height, ...props }: any) => {
        const mediaStyle = getStyleObject(props.style);
        const resolvedSrc = resolveMarkdownAsset(src, filePath, folderPath);

        if (isVideoAsset(src)) {
          return (
            <video
              src={resolvedSrc}
              controls
              width={width}
              height={height}
              style={{
                maxWidth: "100%",
                ...mediaStyle,
              }}
              className="my-4 inline-block rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] align-middle"
            />
          );
        }

        return (
          <img
            src={resolvedSrc}
            alt={alt ?? ""}
            width={width}
            height={height}
            style={{
              maxWidth: "100%",
              ...mediaStyle,
            }}
            className="my-4 inline-block align-middle"
          />
        );
      },
      video: ({ src, children, controls, width, height, ...props }: any) => {
        const videoStyle = getStyleObject(props.style);
        const resolvedSrc = resolveMarkdownAsset(src, filePath, folderPath);

        return (
          <video
            src={resolvedSrc}
            controls={controls ?? true}
            width={width}
            height={height}
            style={{
              maxWidth: "100%",
              ...videoStyle,
            }}
            className="my-4 inline-block rounded-md border border-[var(--axon-panel-border)] bg-[var(--axon-panel-background)] align-middle"
            {...props}
          >
            {children}
          </video>
        );
      },
      source: ({ src, ...props }: any) => (
        <source
          src={resolveMarkdownAsset(src, filePath, folderPath)}
          {...props}
        />
      ),
      ul: ({ children }) => (
        <ul className="my-4 list-disc space-y-1 pl-6">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="my-4 list-decimal space-y-1 pl-6">{children}</ol>
      ),
      li: ({ children, ...props }: any) => {
        const sourceLine = Number(props["data-source-line"]);
        return (
          <TaskLineContext.Provider
            value={Number.isFinite(sourceLine) ? sourceLine : null}
          >
            <li className="pl-1" {...sourceLineFromProps(props)}>
              {children}
            </li>
          </TaskLineContext.Provider>
        );
      },
      input: ({ checked, type }) =>
        type === "checkbox" ? (
          <TaskCheckbox checked={Boolean(checked)} onToggle={handleTaskToggle} />
        ) : null,
      table: ({ children }) => (
        <div className="my-5 overflow-x-auto rounded-md border border-[var(--axon-panel-border)]">
          <table className="w-full border-collapse text-left text-[13px]">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-[var(--axon-panel-background)] text-[var(--axon-editor-foreground)]">
          {children}
        </thead>
      ),
      th: ({ children }) => (
        <th className="border-b border-[var(--axon-panel-border)] px-3 py-2 font-medium">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-t border-[var(--axon-panel-border)] px-3 py-2">
          {children}
        </td>
      ),
      hr: () => <hr className="my-8 border-[var(--axon-panel-border)]" />,
      strong: ({ children }) => (
        <strong className="font-semibold text-[var(--axon-editor-foreground)]">
          {children}
        </strong>
      ),
      section: ({ children, ...props }: any) =>
        props["data-footnotes"] ? (
          <section className="mt-10 border-t border-[var(--axon-panel-border)] pt-4 text-[12px] opacity-80">
            {children}
          </section>
        ) : (
          <section>{children}</section>
        ),
    }),
    [filePath, folderPath, getHeadingId, handleLinkClick, handleTaskToggle],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--axon-editor-background)]">
      <MarkdownPreviewToolbar articleRef={articleRef} filePath={filePath} />
      <div
        ref={previewRef}
        onScroll={handlePreviewScroll}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
      >
        <article
          ref={articleRef}
          className="mx-auto w-full max-w-5xl text-[14px] leading-7 text-[var(--axon-editor-foreground)]"
        >
          <FrontmatterPanel
            metadata={preparedDocument.frontmatter}
            error={preparedDocument.frontmatterError}
          />
          <ReactMarkdown
            rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
            remarkPlugins={remarkPlugins}
            components={markdownComponents}
          >
            {preparedDocument.content}
          </ReactMarkdown>
          <MarkdownReferences references={preparedDocument.references} />
        </article>
      </div>
    </div>
  );
}
