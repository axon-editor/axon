import * as monaco from "monaco-editor";
import { isLargeDocumentModel } from "../../../shared/largeDocument";
import { canUseWorkspaceLanguageTools } from "../../lsp/renderer/lspFileAccess";

const configuredMonacos = new WeakSet<typeof monaco>();
const maxPrefixCharacters = 12_000;
const maxSuffixCharacters = 4_000;

interface InlineCompletionContextSlice {
  prefix: string;
  suffix: string;
  lineSuffix: string;
}

export function shouldRequestInlineAiCompletion(input: {
  linePrefix: string;
  context: Pick<
    monaco.languages.InlineCompletionContext,
    "triggerKind" | "selectedSuggestionInfo" | "includeInlineCompletions"
  >;
}) {
  if (!input.context.includeInlineCompletions) return false;
  if (input.context.selectedSuggestionInfo) return false;
  if (
    input.context.triggerKind ===
    monaco.languages.InlineCompletionTriggerKind.Explicit
  ) {
    return true;
  }

  const linePrefix = input.linePrefix;
  if (linePrefix.trim().length < 2) return false;
  return /[\w)\]}."'`:]$/u.test(linePrefix);
}

export function sliceInlineCompletionContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): InlineCompletionContextSlice {
  const lineContent = model.getLineContent(position.lineNumber);
  const prefix = model
    .getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    })
    .slice(-maxPrefixCharacters);
  const suffix = model
    .getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: model.getLineCount(),
      endColumn: model.getLineMaxColumn(model.getLineCount()),
    })
    .slice(0, maxSuffixCharacters);

  return {
    prefix,
    suffix,
    lineSuffix: lineContent.slice(position.column - 1),
  };
}

export function normalizeInlineCompletionText(input: {
  completion: string;
  lineSuffix: string;
}) {
  const completion = input.completion.replace(/\r\n?/g, "\n");
  if (completion.trim() === "") return "";
  if (completion.includes("\n") && input.lineSuffix.trim() !== "") return "";
  if (input.lineSuffix.startsWith(completion)) return "";
  return completion;
}

function emptyInlineCompletions(): monaco.languages.InlineCompletions {
  return { items: [] };
}

function inlineCompletionRange(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  completion: string,
) {
  const endColumn = completion.includes("\n")
    ? model.getLineMaxColumn(position.lineNumber)
    : position.column;
  return new monaco.Range(
    position.lineNumber,
    position.column,
    position.lineNumber,
    endColumn,
  );
}

export function configureInlineAiCompletions(
  monacoInstance: typeof monaco = monaco,
) {
  if (configuredMonacos.has(monacoInstance)) return;
  configuredMonacos.add(monacoInstance);

  monacoInstance.languages.registerInlineCompletionsProvider(
    { scheme: "file" },
    {
      provideInlineCompletions: async (model, position, context, token) => {
        const settings = window.axonEditorSettings;
        const folderPath = window.axonCompletionWorkspacePath;
        const filePath = model.uri.fsPath;
        const linePrefix = model
          .getLineContent(position.lineNumber)
          .slice(0, position.column - 1);

        if (
          !settings?.ai.enabled ||
          settings.ai.inlineCompletionsEnabled === false ||
          !folderPath ||
          model.uri.scheme !== "file" ||
          isLargeDocumentModel(model) ||
          !canUseWorkspaceLanguageTools(filePath, folderPath) ||
          !shouldRequestInlineAiCompletion({ linePrefix, context })
        ) {
          return emptyInlineCompletions();
        }

        const modelVersion = model.getVersionId();
        const contextSlice = sliceInlineCompletionContext(model, position);
        let resultCompletion = "";
        try {
          const result = await window.axon.getInlineAiCompletion({
            folderPath,
            filePath,
            languageId: model.getLanguageId(),
            prefix: contextSlice.prefix,
            suffix: contextSlice.suffix,
            line: position.lineNumber,
            column: position.column,
          });
          resultCompletion = result.success ? result.completion : "";
        } catch {
          return emptyInlineCompletions();
        }
        const completion = normalizeInlineCompletionText({
          completion: resultCompletion,
          lineSuffix: contextSlice.lineSuffix,
        });

        if (
          token.isCancellationRequested ||
          model.isDisposed() ||
          model.getVersionId() !== modelVersion ||
          completion === ""
        ) {
          return emptyInlineCompletions();
        }

        // The renderer gives Monaco a plain insertion candidate and then gets out
        // of the way. Monaco owns ghost text rendering, Tab acceptance, cursor
        // invalidation, and widget interaction; Axon's custom code only decides
        // whether a local model is allowed to provide a candidate for this file.
        return {
          items: [
            {
              insertText: completion,
              range: inlineCompletionRange(model, position, completion),
              completeBracketPairs: true,
              doNotLog: true,
            },
          ],
          suppressSuggestions: false,
          enableForwardStability: true,
        };
      },
      disposeInlineCompletions: () => {},
    },
  );
}
