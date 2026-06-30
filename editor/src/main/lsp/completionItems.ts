import {
  type LanguageServerCompletionItem,
  type LanguageServerTextEdit,
  type LanguageServerTextPosition,
  type LanguageServerTextRange,
} from "../../shared/lsp";

function normalizeTextPosition(position: unknown): LanguageServerTextPosition | undefined {
  if (!position || typeof position !== "object") return undefined;
  const rawPosition = position as { line?: unknown; character?: unknown };
  if (
    typeof rawPosition.line !== "number" ||
    typeof rawPosition.character !== "number"
  ) {
    return undefined;
  }

  return {
    line: Math.max(0, rawPosition.line),
    character: Math.max(0, rawPosition.character),
  };
}

function normalizeTextRange(range: unknown): LanguageServerTextRange | undefined {
  if (!range || typeof range !== "object") return undefined;
  const rawRange = range as { start?: unknown; end?: unknown };
  const start = normalizeTextPosition(rawRange.start);
  const end = normalizeTextPosition(rawRange.end);
  if (!start || !end) return undefined;

  return { start, end };
}

function normalizeCompletionEditRange(range: unknown) {
  const directRange = normalizeTextRange(range);
  if (directRange) return directRange;

  if (!range || typeof range !== "object") return undefined;
  const rawRange = range as { insert?: unknown; replace?: unknown };

  // LSP 3.16 lets completion items use InsertReplaceEdit so the server can
  // distinguish the small insertion range from the wider replacement range.
  // Monaco accepts a single range in our bridge today, so I choose `replace`
  // when present. That prevents stale suffix text from being left behind when
  // a server wants to replace the whole identifier the user is editing.
  return normalizeTextRange(rawRange.replace) ?? normalizeTextRange(rawRange.insert);
}

function normalizeCompletionTextEdit(
  edit: unknown,
): LanguageServerTextEdit | undefined {
  if (!edit || typeof edit !== "object") return undefined;
  const rawEdit = edit as {
    range?: unknown;
    insert?: unknown;
    replace?: unknown;
    newText?: unknown;
  };
  if (typeof rawEdit.newText !== "string") return undefined;

  const range =
    normalizeCompletionEditRange(rawEdit.range) ??
    normalizeTextRange(rawEdit.replace) ??
    normalizeTextRange(rawEdit.insert);
  if (!range) return undefined;

  return {
    range,
    newText: rawEdit.newText,
  };
}

function normalizeCompletionTextEdits(edits: unknown) {
  if (!Array.isArray(edits)) return undefined;
  const normalizedEdits = edits
    .map(normalizeCompletionTextEdit)
    .filter((edit): edit is LanguageServerTextEdit => edit !== undefined);

  return normalizedEdits.length > 0 ? normalizedEdits : undefined;
}

function normalizeCompletionDocumentation(documentation: unknown) {
  if (typeof documentation === "string") return documentation;
  if (
    documentation &&
    typeof documentation === "object" &&
    "value" in documentation &&
    typeof documentation.value === "string"
  ) {
    return documentation.value;
  }
  return undefined;
}

function getDefaultCompletionRange(defaults: unknown) {
  if (!defaults || typeof defaults !== "object") return undefined;
  const rawDefaults = defaults as { editRange?: unknown };
  return normalizeCompletionEditRange(rawDefaults.editRange);
}

export function normalizeLanguageServerCompletionItems(
  result: unknown,
): LanguageServerCompletionItem[] {
  const rawItems = Array.isArray(result)
    ? result
    : result &&
        typeof result === "object" &&
        "items" in result &&
        Array.isArray(result.items)
      ? result.items
      : [];
  const rawDefaults =
    result && typeof result === "object" && "itemDefaults" in result
      ? (result as { itemDefaults?: unknown }).itemDefaults
      : undefined;
  const defaultEditRange = getDefaultCompletionRange(rawDefaults);
  const defaultInsertTextFormat =
    rawDefaults &&
    typeof rawDefaults === "object" &&
    "insertTextFormat" in rawDefaults &&
    typeof (rawDefaults as { insertTextFormat?: unknown }).insertTextFormat ===
      "number"
      ? (rawDefaults as { insertTextFormat: number }).insertTextFormat
      : undefined;
  const defaultCommitCharacters =
    rawDefaults &&
    typeof rawDefaults === "object" &&
    "commitCharacters" in rawDefaults &&
    Array.isArray((rawDefaults as { commitCharacters?: unknown }).commitCharacters)
      ? (rawDefaults as { commitCharacters: unknown[] }).commitCharacters.filter(
          (character): character is string => typeof character === "string",
        )
      : undefined;

  return rawItems
    .map((item): LanguageServerCompletionItem | null => {
      if (!item || typeof item !== "object" || !("label" in item)) return null;
      const completionItem = item as {
        label?: unknown;
        kind?: unknown;
        detail?: unknown;
        documentation?: unknown;
        insertText?: unknown;
        insertTextFormat?: unknown;
        filterText?: unknown;
        sortText?: unknown;
        commitCharacters?: unknown;
        preselect?: unknown;
        textEdit?: unknown;
        additionalTextEdits?: unknown;
        data?: unknown;
      };
      if (typeof completionItem.label !== "string") return null;

      const insertText =
        typeof completionItem.insertText === "string"
          ? completionItem.insertText
          : undefined;
      const textEdit =
        normalizeCompletionTextEdit(completionItem.textEdit) ??
        (defaultEditRange
          ? {
              range: defaultEditRange,
              newText: insertText ?? completionItem.label,
            }
          : undefined);

      return {
        label: completionItem.label,
        data: completionItem.data,
        kind:
          typeof completionItem.kind === "number"
            ? completionItem.kind
            : undefined,
        detail:
          typeof completionItem.detail === "string"
            ? completionItem.detail
            : undefined,
        documentation: normalizeCompletionDocumentation(
          completionItem.documentation,
        ),
        insertText,
        insertTextFormat:
          typeof completionItem.insertTextFormat === "number"
            ? completionItem.insertTextFormat
            : defaultInsertTextFormat,
        filterText:
          typeof completionItem.filterText === "string"
            ? completionItem.filterText
            : undefined,
        sortText:
          typeof completionItem.sortText === "string"
            ? completionItem.sortText
            : undefined,
        commitCharacters: Array.isArray(completionItem.commitCharacters)
          ? completionItem.commitCharacters.filter(
              (character): character is string => typeof character === "string",
            )
          : defaultCommitCharacters,
        preselect:
          typeof completionItem.preselect === "boolean"
            ? completionItem.preselect
            : undefined,
        textEdit,
        additionalTextEdits: normalizeCompletionTextEdits(
          completionItem.additionalTextEdits,
        ),
      };
    })
    .filter((item): item is LanguageServerCompletionItem => item !== null)
    // TypeScript can return a large list when package auto-imports are enabled.
    // Capping at 200 was enough for local symbols but could cut off third-party
    // exports such as icon components before the renderer ever saw them.
    .slice(0, 1000);
}
