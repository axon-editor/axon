/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  resolveFileIcon,
  resolveFolderIcon,
} from "./catppuccinIconMappings";
import { getCatppuccinIconAsset } from "./iconAssetPaths";

function SvgIcon({ src, size = 16 }: { src: string; size?: number }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

export function getFileIcon(filename: string, size = 16) {
  return (
    <SvgIcon src={getCatppuccinIconAsset(resolveFileIcon(filename))} size={size} />
  );
}

export function getFolderIcon(name: string, expanded: boolean, size = 16) {
  return (
    <SvgIcon
      src={getCatppuccinIconAsset(resolveFolderIcon(name, expanded))}
      size={size}
    />
  );
}
