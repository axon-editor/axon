/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiChatResult } from "@axon-editor/shared/ai/ai";
import { validEditProposal } from "./validEditProposal";

export function validResult(value: unknown): AiChatResult | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const result = value as Partial<AiChatResult>;
  if (
    typeof result.success !== "boolean" ||
    typeof result.message !== "string" ||
    typeof result.modelLabel !== "string" ||
    typeof result.providerLabel !== "string"
  ) {
    return undefined;
  }
  return {
    success: result.success,
    message: result.message,
    modelLabel: result.modelLabel,
    providerLabel: result.providerLabel,
    editProposal: validEditProposal(result.editProposal),
  };
}
