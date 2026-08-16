import { useCallback, useEffect, useRef, type RefObject } from "react";
import * as monaco from "monaco-editor";
import { type GitChange } from "@axon-editor/shared/git";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/themeTokens";
import {
  inferThemeAppearance,
  resolveThemeGitColors,
} from "@axon-editor/renderer/shared/themes/themeAppearance";
import { computeGitLineDecorations } from "./gitLineDecorations";
import { isLargeDocumentModel } from "@axon-editor/shared/largeDocument";

interface Options {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>;
  editorReadyNonce: number;
  filePath: string;
  folderPath: string | null;
  gitChange: GitChange | undefined;
  loading: boolean;
  themeTokens: ResolvedThemeTokens;
}

export default function useGitLineDecorations({
  editorRef,
  editorReadyNonce,
  filePath,
  folderPath,
  gitChange,
  loading,
  themeTokens,
}: Options) {
  const collectionRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const baseContentRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const gitAbsolutePath = gitChange?.absolutePath;
  const gitIndexState = gitChange?.indexState;
  const gitStaged = gitChange?.staged;
  const gitUnstaged = gitChange?.unstaged;
  const gitWorktreeState = gitChange?.worktreeState;

  const paintCurrentModel = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const baseContent = baseContentRef.current;
    if (!editor || !model || model.isDisposed() || baseContent === null) return;
    if (isLargeDocumentModel(model)) {
      collectionRef.current?.clear();
      return;
    }

    const decorations = computeGitLineDecorations(
      baseContent,
      model.getValue(),
    );
    const gitColors = resolveThemeGitColors(
      themeTokens,
      inferThemeAppearance(themeTokens),
    );
    collectionRef.current ??= editor.createDecorationsCollection();
    collectionRef.current.set(
      decorations.map((decoration) => ({
        range: new monaco.Range(
          decoration.lineNumber,
          1,
          decoration.lineNumber,
          1,
        ),
        options: {
          isWholeLine: true,
          className: `axon-git-line axon-git-line--${decoration.kind}`,
          linesDecorationsClassName: `axon-git-gutter axon-git-gutter--${decoration.kind}`,
          glyphMarginClassName: `axon-git-glyph axon-git-glyph--${decoration.kind}`,
          overviewRuler: {
            color:
              decoration.kind === "added"
                ? gitColors.added
                : decoration.kind === "modified"
                  ? gitColors.modified
                  : gitColors.deleted,
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      })),
    );
  }, [editorRef, themeTokens]);

  const scheduleGitDecorationRefresh = useCallback(
    (delayMs = 48) => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        paintCurrentModel();
      }, delayMs);
    },
    [paintCurrentModel],
  );

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const request = ++requestRef.current;
    baseContentRef.current = null;

    if (
      loading ||
      !editor ||
      !folderPath ||
      !gitAbsolutePath ||
      !model ||
      isLargeDocumentModel(model)
    ) {
      collectionRef.current?.clear();
      return;
    }

    window.axon
      .getGitDiff(
        folderPath,
        filePath,
        Boolean(gitStaged && !gitUnstaged),
        gitIndexState === "untracked",
      )
      .then((result) => {
        if (request !== requestRef.current) return;
        baseContentRef.current = result.baseContent ?? "";
        paintCurrentModel();
      })
      .catch((error) => {
        if (request !== requestRef.current) return;
        console.error("failed to load git editor decorations:", error);
        collectionRef.current?.clear();
      });
  }, [
    editorReadyNonce,
    editorRef,
    filePath,
    folderPath,
    gitAbsolutePath,
    gitIndexState,
    gitStaged,
    gitUnstaged,
    gitWorktreeState,
    loading,
    paintCurrentModel,
  ]);

  useEffect(
    () => () => {
      requestRef.current += 1;
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      collectionRef.current?.clear();
      collectionRef.current = null;
    },
    [],
  );

  return scheduleGitDecorationRefresh;
}
