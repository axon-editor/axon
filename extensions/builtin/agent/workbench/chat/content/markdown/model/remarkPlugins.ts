/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import remarkGfm from "remark-gfm";

// ReactMarkdown treats a new plugin array as a reason to re-parse the whole
// document. Hoisting the array keeps streamed tokens from rebuilding the GFM
// pipeline on every render.
export const REMARK_PLUGINS = [remarkGfm];
