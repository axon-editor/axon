/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  getFileIcon,
  getFolderIcon,
} from "../../sidebar/files/lib/icons/fileIcons";

interface Props {
  name: string;
  isDir: boolean;
  expanded?: boolean;
  color?: string;
}

export default function ZenEntryIcon({
  name,
  isDir,
  expanded = false,
  color,
}: Props) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center"
      style={{ color }}
    >
      {isDir ? getFolderIcon(name, expanded) : getFileIcon(name)}
    </span>
  );
}
