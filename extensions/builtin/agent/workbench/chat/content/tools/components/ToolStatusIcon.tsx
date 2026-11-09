/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Check, Loader2, Play, X } from "lucide-react";
import { type AgentToolCallState } from "../../../../lib/conversation";

interface Props {
  status: AgentToolCallState["status"];
}

export default function ToolStatusIcon({ status }: Props) {
  if (status === "running") {
    return <Loader2 size={11} className="animate-spin" />;
  }
  if (status === "done") return <Check size={11} />;
  if (status === "rejected" || status === "error") return <X size={11} />;
  return <Play size={10} />;
}
