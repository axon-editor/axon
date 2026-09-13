/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type LanguageServerId } from "../../../shared/lsp";

const LANGUAGE_SERVER_HOVER_TIMEOUT_MS = 2_500;
const JVM_LANGUAGE_SERVER_HOVER_TIMEOUT_MS = 15_000;
const JVM_LANGUAGE_SERVER_WARMUP_TIMEOUT_MS = 15_000;

export function getLanguageServerHoverTimeoutMs(serverId: LanguageServerId) {
  return ["java", "kotlin", "scala"].includes(serverId)
    ? JVM_LANGUAGE_SERVER_HOVER_TIMEOUT_MS
    : LANGUAGE_SERVER_HOVER_TIMEOUT_MS;
}

export function getLanguageServerWarmupTimeoutMs(
  serverId: LanguageServerId,
  defaultTimeoutMs: number,
) {
  return ["java", "kotlin", "scala"].includes(serverId)
    ? Math.max(defaultTimeoutMs, JVM_LANGUAGE_SERVER_WARMUP_TIMEOUT_MS)
    : defaultTimeoutMs;
}
