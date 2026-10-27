/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiEditProposal } from "@axon-editor/shared/ai/ai";

export function validEditProposal(value: unknown): AiEditProposal | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const proposal = value as Partial<AiEditProposal>;
  if (typeof proposal.title !== "string" || !Array.isArray(proposal.files)) {
    return undefined;
  }
  const files = proposal.files.filter(
    (file): file is AiEditProposal["files"][number] =>
      typeof file === "object" &&
      file !== null &&
      typeof file.path === "string" &&
      typeof file.newContent === "string" &&
      typeof file.summary === "string",
  );
  if (!files.length) return undefined;
  return { title: proposal.title, files };
}
