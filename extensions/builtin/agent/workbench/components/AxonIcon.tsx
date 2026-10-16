/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { publicAsset } from "@axon-editor/renderer/shared/lib/assets/assets";

// The sidebar used to brand every Axon surface with a bare "A" initial, which
// read as a placeholder next to the real product mark. This renders the shipped
// Axon icon (axon.png, the same artwork behind the app icon and README) so the
// header, empty state, and assistant messages all carry the actual brand. The
// artwork has a transparent background and a non-square aspect, so it is sized
// by its longest edge and letterboxed with object-contain to stop it stretching
// inside the square avatar slots.
interface Props {
  size?: number;
  className?: string;
}

export default function AxonIcon({ size = 16, className }: Props) {
  return (
    <img
      src={publicAsset("axon.png")}
      alt=""
      width={size}
      height={size}
      className={`object-contain ${className ?? ""}`}
      draggable={false}
    />
  );
}
