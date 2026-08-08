import { parseDocument } from "yaml";

interface MarkdownPosition {
  start?: { line?: number };
}

interface MarkdownNode {
  type: string;
  value?: string;
  name?: string | null;
  url?: string;
  children?: MarkdownNode[];
  attributes?: Array<{
    type?: string;
    name?: string;
    value?: string | null | { type?: string; value?: string };
  }>;
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  position?: MarkdownPosition;
}

export interface MarkdownReference {
  id: string;
  title: string;
  author?: string;
  year?: string;
  url?: string;
}

export interface PreparedMarkdownDocument {
  content: string;
  frontmatter: Record<string, unknown> | null;
  frontmatterError: string | null;
  references: MarkdownReference[];
}

const FRONTMATTER_PATTERN = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const SOURCE_LINE_NODE_TYPES = new Set([
  "blockquote",
  "code",
  "heading",
  "list",
  "listItem",
  "paragraph",
  "table",
  "thematicBreak",
]);
const SAFE_MDX_ELEMENTS = new Set([
  "a",
  "aside",
  "details",
  "div",
  "kbd",
  "mark",
  "section",
  "small",
  "span",
  "sub",
  "summary",
  "sup",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function referenceFromValue(
  fallbackId: string,
  value: unknown,
): MarkdownReference | null {
  if (typeof value === "string") {
    return { id: fallbackId, title: value };
  }

  const record = asRecord(value);
  if (!record) return null;
  const id = String(record.id ?? record.key ?? fallbackId).trim();
  const title = String(record.title ?? record.name ?? "").trim();
  if (!id || !title) return null;

  return {
    id,
    title,
    author: record.author ? String(record.author) : undefined,
    year: record.year ? String(record.year) : undefined,
    url: record.url ? String(record.url) : undefined,
  };
}

function collectReferences(
  frontmatter: Record<string, unknown> | null,
): MarkdownReference[] {
  const rawReferences = frontmatter?.references ?? frontmatter?.bibliography;
  if (Array.isArray(rawReferences)) {
    return rawReferences
      .map((value, index) => referenceFromValue(String(index + 1), value))
      .filter((value): value is MarkdownReference => Boolean(value));
  }

  const referenceMap = asRecord(rawReferences);
  if (!referenceMap) return [];
  return Object.entries(referenceMap)
    .map(([id, value]) => referenceFromValue(id, value))
    .filter((value): value is MarkdownReference => Boolean(value));
}

export function prepareMarkdownDocument(
  content: string,
): PreparedMarkdownDocument {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) {
    return {
      content,
      frontmatter: null,
      frontmatterError: null,
      references: [],
    };
  }

  try {
    // Workspace Markdown is untrusted input. Limiting aliases prevents a small
    // frontmatter block from expanding into an unexpectedly large object while
    // still supporting ordinary YAML anchors used by documentation projects.
    const document = parseDocument(match[1], {
      prettyErrors: false,
      schema: "core",
    });
    if (document.errors.length > 0) {
      throw document.errors[0];
    }
    const frontmatter = asRecord(document.toJS({ maxAliasCount: 32 }));
    return {
      content,
      frontmatter,
      frontmatterError: null,
      references: collectReferences(frontmatter),
    };
  } catch (error) {
    return {
      content,
      frontmatter: null,
      frontmatterError:
        error instanceof Error ? error.message.split("\n", 1)[0] : "Invalid YAML frontmatter",
      references: [],
    };
  }
}

function visitTree(
  node: MarkdownNode,
  visitor: (node: MarkdownNode, parent: MarkdownNode | null) => void,
  parent: MarkdownNode | null = null,
) {
  visitor(node, parent);
  node.children?.forEach((child) => visitTree(child, visitor, node));
}

function withProperties(node: MarkdownNode, properties: Record<string, unknown>) {
  node.data ??= {};
  node.data.hProperties = {
    ...node.data.hProperties,
    ...properties,
  };
}

export function remarkAxonCallouts() {
  return (tree: MarkdownNode) => {
    visitTree(tree, (node) => {
      if (node.type !== "blockquote") return;
      const firstParagraph = node.children?.[0];
      const markerNode = firstParagraph?.children?.[0];
      if (markerNode?.type !== "text" || !markerNode.value) return;

      const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n)?/i.exec(
        markerNode.value,
      );
      if (!match) return;

      markerNode.value = markerNode.value.slice(match[0].length);
      withProperties(node, { "data-callout": match[1].toLowerCase() });
    });
  };
}

function wikiTargetToHref(target: string) {
  const [pathPart, hashPart] = target.trim().split("#", 2);
  if (!pathPart) return hashPart ? `#${hashPart}` : "#";
  const hasExtension = /(?:^|\/)[^/]+\.[^/]+$/.test(pathPart);
  return `${hasExtension ? pathPart : `${pathPart}.md`}${hashPart ? `#${hashPart}` : ""}`;
}

function enrichedTextNodes(value: string): MarkdownNode[] | null {
  const pattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[@([A-Za-z0-9_.:+-]+)\]/g;
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    }

    if (match[3]) {
      const id = match[3];
      nodes.push({
        type: "link",
        url: `#citation-${id}`,
        children: [{ type: "text", value: `[${id}]` }],
        data: { hProperties: { "data-citation": id } },
      });
    } else {
      const target = match[1].trim();
      nodes.push({
        type: "link",
        url: wikiTargetToHref(target),
        children: [{ type: "text", value: (match[2] ?? target).trim() }],
        data: { hProperties: { "data-wiki-link": target } },
      });
    }
    cursor = pattern.lastIndex;
  }

  if (cursor === 0) return null;
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes;
}

export function remarkAxonWikiLinksAndCitations() {
  return (tree: MarkdownNode) => {
    const transformChildren = (parent: MarkdownNode) => {
      if (!parent.children) return;
      if (["code", "inlineCode", "link"].includes(parent.type)) return;

      parent.children = parent.children.flatMap((child) => {
        if (child.type === "text" && child.value) {
          return enrichedTextNodes(child.value) ?? child;
        }
        transformChildren(child);
        return child;
      });
    };
    transformChildren(tree);
  };
}

function staticMdxProperties(node: MarkdownNode) {
  const properties: Record<string, unknown> = {};
  node.attributes?.forEach((attribute) => {
    if (attribute.type !== "mdxJsxAttribute" || !attribute.name) return;
    if (attribute.value === null || attribute.value === undefined) {
      properties[attribute.name] = true;
      return;
    }
    if (typeof attribute.value === "string") {
      properties[attribute.name] = attribute.value;
    }
  });
  return properties;
}

export function remarkAxonSafeMdx() {
  return (tree: MarkdownNode) => {
    const transform = (parent: MarkdownNode) => {
      if (!parent.children) return;

      parent.children = parent.children.flatMap((node) => {
        if (node.type === "mdxjsEsm") return [];

        if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
          return {
            type: node.type === "mdxFlowExpression" ? "code" : "inlineCode",
            value: `{${node.value ?? ""}}`,
          };
        }

        if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
          const componentName = node.name ?? "Fragment";
          const lowerName = componentName.toLowerCase();
          const isFlow = node.type === "mdxJsxFlowElement";
          let elementName = SAFE_MDX_ELEMENTS.has(lowerName)
            ? lowerName
            : isFlow
              ? "div"
              : "span";
          const properties = staticMdxProperties(node);

          if (componentName === "Callout") {
            elementName = "aside";
            properties["data-callout"] = String(properties.type ?? "note").toLowerCase();
          } else if (componentName === "Badge") {
            elementName = "span";
            properties["data-mdx-badge"] = true;
          } else if (!SAFE_MDX_ELEMENTS.has(lowerName)) {
            properties["data-mdx-component"] = componentName;
          }

          node.type = isFlow ? "paragraph" : "emphasis";
          node.data = { hName: elementName, hProperties: properties };
          transform(node);
          return node;
        }

        transform(node);
        return node;
      });
    };
    transform(tree);
  };
}

export function remarkAxonSourceLines() {
  return (tree: MarkdownNode) => {
    visitTree(tree, (node) => {
      const line = node.position?.start?.line;
      if (!line || !SOURCE_LINE_NODE_TYPES.has(node.type)) return;
      withProperties(node, { "data-source-line": line });
    });
  };
}

export function remarkHideFrontmatter() {
  return (tree: MarkdownNode) => {
    if (!tree.children) return;
    tree.children = tree.children.filter((node) => node.type !== "yaml");
  };
}

export function toggleMarkdownTask(
  content: string,
  lineNumber: number,
  checked: boolean,
) {
  const lines = content.split(/\r?\n/);
  const lineIndex = lineNumber - 1;
  const line = lines[lineIndex];
  if (line === undefined) return content;

  const marker = /^(\s*(?:(?:[-+*])|(?:\d+[.)]))\s+)\[([ xX])\]/;
  if (!marker.test(line)) return content;
  lines[lineIndex] = line.replace(marker, `$1[${checked ? "x" : " "}]`);
  return lines.join(content.includes("\r\n") ? "\r\n" : "\n");
}
