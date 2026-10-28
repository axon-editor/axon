/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type AiCommandPermissionMode } from "@axon-editor/shared/core/settings";
import { type SearchSelectItem } from "@axon-editor/base/components/SearchSelect";

export const COMMAND_PERMISSION_ITEMS: SearchSelectItem<AiCommandPermissionMode>[] =
  [
    {
      value: "ask",
      label: "Ask every time",
      description:
        "Show the approval card for every shell command, even commands already allowed this session.",
    },
    {
      value: "allowlist",
      label: "Allow approved commands",
      description:
        "Ask once for an exact command and working directory, then run that pair without asking again for this session.",
    },
    {
      value: "auto",
      label: "Run without asking",
      description:
        "Run shell commands immediately. Only use this when you trust the agent with your workspace and user account.",
    },
  ];
