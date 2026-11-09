/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shiki wraps highlighted output in its own pre tag, but the card already owns
// the scroll container and padding. Stripping the wrapper lets the inner markup
// inherit the card layout instead of nesting two pre elements.
export function stripPreTag(html: string): string {
  return html.replace(/<pre[^>]*>/, "").replace(/<\/pre>$/, "");
}
