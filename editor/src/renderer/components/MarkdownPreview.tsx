import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  isValidElement,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

interface MarkdownPreviewProps {
  content: string;
  filePath: string;
  folderPath: string | null;
  onOpenFile?: (path: string) => void;
}

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

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Electron can expose the browser Clipboard API while still denying the
      // actual write for the current document/scheme. Falling through to the
      // preload bridge keeps the code-block button honest: if the native
      // Electron clipboard succeeds, the UI can safely show the copied mark.
    }
  }

  // Electron's renderer can lose access to the browser Clipboard API depending
  // on the loaded scheme and permission state. The preload bridge keeps the
  // renderer sandboxed while still using Electron's native clipboard in the
  // main process, so the copy button behaves consistently in dev and packaged
  // builds without relying on deprecated DOM commands.
  await window.axon.copyText(text);
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

function CodeBlock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const language = /language-([\w-]+)/.exec(className ?? "")?.[1] ?? "text";
  const code = useMemo(
    () => textFromNode(children).replace(/\n$/, ""),
    [children],
  );

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("failed to copy markdown code block:", err);
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-[#30363d] bg-[#0d1117] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <pre className="m-0 overflow-x-auto p-4 text-[13px] leading-6 text-[#c9d1d9]">
        <code className={className}>{children}</code>
      </pre>
      <div className="absolute right-2 top-2 flex items-center gap-2">
        {language !== "text" ? (
          <span className="rounded bg-[#010409]/80 px-1.5 py-0.5 text-[10px] text-[#7d8590] opacity-0 transition-opacity group-hover:opacity-100">
            {language}
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied code" : "Copy code"}
          className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-all ${
            copied
              ? "border-[#2ea043] bg-[#16351f] text-[#7ee787]"
              : "border-[#30363d] bg-[#161b22] text-[#8b949e] opacity-80 hover:border-[#8b949e] hover:text-[#f0f6fc] group-hover:opacity-100"
          }`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
}

export default function MarkdownPreview({
  content,
  filePath,
  folderPath,
  onOpenFile,
}: MarkdownPreviewProps) {
  const handleLinkClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string | undefined,
  ) => {
    if (!href || isInlineReference(href)) return;
    event.preventDefault();

    if (isExternalUrl(href)) {
      void window.axon.openExternalLink(href);
      return;
    }

    const targetPath = resolveMarkdownLinkPath(href, filePath, folderPath);
    if (targetPath && onOpenFile) {
      onOpenFile(targetPath);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#0e1018] px-5 py-6">
      <article className="mx-auto w-full max-w-5xl text-[14px] leading-7 text-[#c8d0e0]">
        <ReactMarkdown
          rehypePlugins={[rehypeRaw]}
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mb-5 border-b border-[#222838] pb-3 text-[26px] font-semibold leading-tight text-white">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-3 mt-8 border-b border-[#222838] pb-2 text-[20px] font-semibold leading-tight text-white">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-2 mt-6 text-[16px] font-semibold leading-tight text-white">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="mb-2 mt-5 text-[14px] font-semibold leading-tight text-[#e6ebf5]">
                {children}
              </h4>
            ),
            p: ({ children, ...props }: any) => (
              <p className="my-4" style={getFlowStyle(props)}>
                {children}
              </p>
            ),
            center: ({ children, ...props }: any) => (
              <div style={{ ...getFlowStyle(props), textAlign: "center" }}>
                {children}
              </div>
            ),
            div: ({ children, ...props }: any) => (
              <div style={getFlowStyle(props)}>
                {children}
              </div>
            ),
            a: ({ children, href }) => (
              <a
                href={
                  isExternalUrl(href ?? "") || isInlineReference(href ?? "")
                    ? href
                    : resolveMarkdownLinkPath(href, filePath, folderPath) ?? href
                }
                onClick={(event) => handleLinkClick(event, href)}
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[#80c8e0] underline-offset-4 hover:underline"
              >
                {children}
                {href && isExternalUrl(href) && <ExternalLink size={11} />}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-5 border-l-2 border-[#80c8e0] bg-[#10131b] px-4 py-2 text-[#9aa4b8]">
                {children}
              </blockquote>
            ),
            code: ({ children, ...props }: any) => (
              <code
                className="rounded bg-[#14161e] px-1.5 py-0.5 text-[13px] text-[#80c8e0]"
                {...props}
              >
                {children}
              </code>
            ),
            pre: ({ children }: any) => {
              // React Markdown no longer gives a dependable `inline` flag in
              // every renderer path. Treating `pre` as the only fenced-code
              // entry point prevents single-backtick text like `7777` from
              // being mistaken for a full GitHub-style code block.
              return (
                <CodeBlock className={getClassNameFromNode(children)}>
                  {textFromNode(children)}
                </CodeBlock>
              );
            },
            img: ({ src, alt, width, height, ...props }: any) => {
              const imageStyle = getStyleObject(props.style);

              return (
                <img
                  src={resolveMarkdownAsset(src, filePath, folderPath)}
                  alt={alt ?? ""}
                  width={width}
                  height={height}
                  style={{
                    maxWidth: "100%",
                    ...imageStyle,
                  }}
                  className="my-4 inline-block align-middle"
                />
              );
            },
            ul: ({ children }) => (
              <ul className="my-4 list-disc space-y-1 pl-6">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="my-4 list-decimal space-y-1 pl-6">{children}</ol>
            ),
            li: ({ children }) => <li className="pl-1">{children}</li>,
            input: ({ checked, type }) =>
              type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 translate-y-[1px] accent-[#80c8e0]"
                />
              ) : null,
            table: ({ children }) => (
              <div className="my-5 overflow-x-auto rounded-md border border-[#222838]">
                <table className="w-full border-collapse text-left text-[13px]">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[#10131b] text-white">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="border-b border-[#222838] px-3 py-2 font-medium">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-t border-[#1a2030] px-3 py-2">
                {children}
              </td>
            ),
            hr: () => <hr className="my-8 border-[#222838]" />,
            strong: ({ children }) => (
              <strong className="font-semibold text-white">{children}</strong>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
