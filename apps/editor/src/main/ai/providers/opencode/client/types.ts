/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// These types mirror only the OpenCode v2 fields Axon consumes. The full API is
// much larger, and importing its generated schema would make Axon brittle to
// every internal rename. Unknown fields stay ignored.
export interface OpenCodeModel {
  id: string;
  modelID?: string;
  providerID: string;
  type?: string;
  name?: string;
  status?: string;
  enabled?: boolean;
  capabilities?: {
    tools?: boolean;
    input?: string[];
    output?: string[];
  };
}

export interface OpenCodeModelResponse {
  location?: { directory: string };
  data: OpenCodeModel[];
}

export interface OpenCodeProvider {
  id: string;
  name: string;
  activation?: string;
}

export interface OpenCodeProviderResponse {
  data: OpenCodeProvider[];
}

export interface OpenCodeSessionModel {
  id: string;
  providerID: string;
  variant?: string;
}

export interface OpenCodeSession {
  id: string;
  model?: OpenCodeSessionModel;
  location?: { directory: string };
}

export interface OpenCodeSessionResponse {
  data: OpenCodeSession;
}

export interface OpenCodePermissionRequest {
  id: string;
  sessionID: string;
  action: string;
  resources: string[];
  save?: string[];
  metadata?: Record<string, unknown>;
  source?: {
    type: "tool";
    messageID: string;
    id: string;
  };
  message?: string;
}

export type OpenCodePermissionDecision = "once" | "always" | "reject";

export interface OpenCodeShellInfo {
  id: string;
  status?: string;
  command?: string;
  cwd?: string;
}

export interface OpenCodeToolContent {
  type?: string;
  text?: string;
}

export interface OpenCodeEvent {
  id?: string;
  created?: number;
  type: string;
  data?: Record<string, unknown>;
  location?: { directory: string };
}
