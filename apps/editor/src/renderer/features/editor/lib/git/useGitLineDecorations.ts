/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type * as monaco from "monaco-editor";
import { type GitChange } from "@axon-editor/shared/workspace/git";
import { type ResolvedThemeTokens } from "@axon-editor/renderer/shared/lib/theme/themeTokens";
import {
  inferThemeAppearance,
  resolveThemeGitColors,
} from "@axon-editor/renderer/shared/themes/appearance/themeAppearance";
import { computeGitLineDecorations } from "@axon-editor/renderer/shared/lib/git/gitLineDecorations";
import { buildGitLineDecorations } from "@axon-editor/renderer/shared/lib/git/gitLinePaint";
import { isLargeDocumentModel } from "@axon-editor/shared/editor/documents/largeDocument";

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

    const decorations = buildGitLineDecorations(
      computeGitLineDecorations(baseContent, model.getValue()),
      resolveThemeGitColors(inferThemeAppearance(themeTokens)),
    );
    collectionRef.current ??= editor.createDecorationsCollection();
    collectionRef.current.set(decorations);
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
