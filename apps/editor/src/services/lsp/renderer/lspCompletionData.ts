// These catalogs are kept outside the completion provider because they are
// immutable editor data, not completion flow. Keeping them separate makes the
// provider easier to review without changing when or how suggestions appear.
export const lspCompletionLanguages = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "go",
  "rust",
  "python",
  "java",
  "csharp",
  "kotlin",
  "php",
  "lua",
  "cpp",
  "dockerfile",
  "html",
  "css",
  "scss",
  "less",
  "json",
  "yaml",
  "shell",
  "proto",
  "xml",
];

export const webTagLanguages = [
  "html",
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
];

export const identifierTriggerCharacters = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "_",
  "$",
];

export const packageExportCompletionLanguages = new Set([
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
]);

export const tailwindUtilityLanguages = [
  "html",
  "css",
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
];

export const localSymbolLanguages = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "go",
  "rust",
  "python",
  "java",
  "csharp",
  "kotlin",
  "php",
  "lua",
  "cpp",
  "html",
  "css",
  "json",
  "yaml",
  "shell",
  "dockerfile",
];

export const webTagSnippets = [
  { label: "div", insertText: "<div>$0</div>", detail: "HTML div element" },
  {
    label: "span",
    insertText: "<span>$0</span>",
    detail: "HTML span element",
  },
  {
    label: "section",
    insertText: "<section>$0</section>",
    detail: "HTML section element",
  },
  {
    label: "main",
    insertText: "<main>$0</main>",
    detail: "HTML main element",
  },
  {
    label: "button",
    insertText: '<button type="button">$0</button>',
    detail: "HTML button element",
  },
  {
    label: "input",
    insertText: "<input $0/>",
    detail: "HTML input element",
  },
  {
    label: "form",
    insertText: "<form>$0</form>",
    detail: "HTML form element",
  },
];

export const htmlDocumentSnippet = {
  label: "!",
  insertText:
    '<!doctype html>\n<html lang="${1:en}">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${2:Document}</title>\n</head>\n<body>\n  $0\n</body>\n</html>',
  detail: "HTML document template",
};

export const emmetVoidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

export const dockerfileSnippets = [
  ["FROM", "FROM ${1:node:22-alpine}"],
  ["WORKDIR", "WORKDIR ${1:/app}"],
  ["COPY", "COPY ${1:.} ${2:.}"],
  ["RUN", "RUN ${1:npm install}"],
  ["CMD", 'CMD ["${1:npm}", "${2:start}"]'],
  ["EXPOSE", "EXPOSE ${1:3000}"],
  ["ENV", "ENV ${1:NODE_ENV}=${2:production}"],
  ["ARG", "ARG ${1:VERSION}"],
].map(([label, insertText]) => ({
  label,
  insertText,
  detail: "Dockerfile instruction",
}));

export const pythonBuiltinSuggestions = [
  "print",
  "len",
  "range",
  "enumerate",
  "zip",
  "map",
  "filter",
  "list",
  "dict",
  "set",
  "tuple",
  "str",
  "int",
  "float",
  "bool",
  "type",
  "isinstance",
  "super",
  "open",
  "sorted",
  "sum",
  "min",
  "max",
  "any",
  "all",
  "class",
  "def",
  "return",
  "import",
  "from",
  "async",
  "await",
];

export const tailwindUtilitySuggestions = [
  "flex",
  "grid",
  "hidden",
  "block",
  "inline-flex",
  "items-center",
  "items-start",
  "justify-center",
  "justify-between",
  "gap-1",
  "gap-2",
  "gap-3",
  "p-2",
  "px-3",
  "py-2",
  "m-0",
  "mx-auto",
  "w-full",
  "h-full",
  "min-h-0",
  "rounded",
  "rounded-md",
  "rounded-lg",
  "border",
  "border-transparent",
  "bg-transparent",
  "bg-black",
  "bg-white",
  "text-white",
  "text-black",
  "text-sm",
  "text-xs",
  "font-medium",
  "font-semibold",
  "truncate",
  "overflow-hidden",
  "overflow-y-auto",
  "transition-colors",
  "cursor-pointer",
];

export const tailwindVariantPrefixes = [
  "hover",
  "focus",
  "active",
  "disabled",
  "group-hover",
  "dark",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
];
