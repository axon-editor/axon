import * as monaco from "monaco-editor";
import { readFile, writeFile } from "../../../renderer/shared/lib/api";
import { updateModel } from "../../../renderer/features/editor/lib/monacoModels";
import { type LanguageServerTextEdit } from "../../../shared/lsp";

function getLineOffsets(text: string) {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) offsets.push(index + 1);
  }
  return offsets;
}

function getOffset(
  text: string,
  offsets: number[],
  position: LanguageServerTextEdit["range"]["start"],
) {
  const lineOffset = offsets[position.line] ?? text.length;
  return Math.min(text.length, lineOffset + position.character);
}

function applyTextEditsToString(
  content: string,
  edits: LanguageServerTextEdit[],
) {
  const offsets = getLineOffsets(content);
  const orderedEdits = [...edits].sort((left, right) => {
    const leftOffset = getOffset(content, offsets, left.range.start);
    const rightOffset = getOffset(content, offsets, right.range.start);
    return rightOffset - leftOffset;
  });

  return orderedEdits.reduce((nextContent, edit) => {
    const nextOffsets = getLineOffsets(nextContent);
    const start = getOffset(nextContent, nextOffsets, edit.range.start);
    const end = getOffset(nextContent, nextOffsets, edit.range.end);
    return `${nextContent.slice(0, start)}${edit.newText}${nextContent.slice(end)}`;
  }, content);
}

function toMonacoRange(edit: LanguageServerTextEdit) {
  return new monaco.Range(
    edit.range.start.line + 1,
    edit.range.start.character + 1,
    edit.range.end.line + 1,
    edit.range.end.character + 1,
  );
}

export async function applyWorkspaceEdits(
  editsByFile: Record<string, LanguageServerTextEdit[]>,
  folderPath: string,
  monacoInstance: typeof monaco = monaco,
) {
  const failures: string[] = [];

  for (const [filePath, edits] of Object.entries(editsByFile)) {
    if (edits.length === 0) continue;

    const uri = monaco.Uri.file(filePath);
    const model = monacoInstance.editor.getModel(uri);
    if (model && !model.isDisposed()) {
      model.pushEditOperations(
        [],
        edits.map((edit) => ({
          range: toMonacoRange(edit),
          text: edit.newText,
          forceMoveMarkers: true,
        })),
        () => null,
      );
      continue;
    }

    try {
      // LSP workspace edits often touch unopened files during rename,
      // organize-imports, and source actions. I patch those files through the
      // same core file API used by normal saves so the renderer still never
      // receives raw filesystem access.
      const file = await readFile(filePath);
      const nextContent = applyTextEditsToString(file.content, edits);
      if (nextContent !== file.content) {
        await writeFile(filePath, nextContent, folderPath);
        updateModel(filePath, nextContent);
      }
    } catch (err) {
      console.error("failed to apply workspace edit:", filePath, err);
      failures.push(filePath);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}
