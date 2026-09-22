/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// DOM sync layer. Provides morphdom for DOM patching and scroll sync
// for bidirectional editor-preview synchronization.

export {
  morphdom,
  captureImageDimensions,
  applyImageDimensions,
} from "./morphdom";

export {
  publishMarkdownScroll,
  onMarkdownScroll,
  findNearestSourceLine,
  findVisibleSourceLine,
  type MarkdownScrollEvent,
} from "./scrollSync";
