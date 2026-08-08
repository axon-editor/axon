import { defaultSchema } from "rehype-sanitize";
import type { Schema } from "hast-util-sanitize";

const attributes = defaultSchema.attributes ?? {};
const protocols = defaultSchema.protocols ?? {};

// Raw HTML is useful in project documentation, but the preview runs inside the
// privileged Axon renderer. This schema keeps formatting, media, source-line
// metadata, task lists, and MathML inputs while dropping scripts, iframes,
// embedded objects, event handlers, and unsafe link protocols before React sees
// them. KaTeX runs after this boundary and therefore does not need its large
// generated span/MathML vocabulary added to the untrusted-input allowlist.
export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "aside",
    "center",
    "mark",
    "video",
  ],
  attributes: {
    ...attributes,
    "*": [
      ...(attributes["*"] ?? []),
      "className",
      "data*",
      "style",
    ],
    code: [
      ...(attributes.code ?? []),
      ["className", /^language-./, "math-inline", "math-display"],
    ],
    source: [...(attributes.source ?? []), "media", "src", "type"],
    video: [
      "controls",
      "height",
      "loop",
      "muted",
      "playsInline",
      "poster",
      "preload",
      "src",
      "width",
    ],
  },
  protocols: {
    ...protocols,
    src: [...(protocols.src ?? []), "axon", "blob", "data"],
  },
};
