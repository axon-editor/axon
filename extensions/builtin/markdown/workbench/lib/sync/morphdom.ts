/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// DOM diffing and patching. Replaces innerHTML with minimal DOM mutations
// to avoid flickering, preserving scroll position, image dimensions, and
// CSS transitions.
//
// This is a simplified morphdom implementation. The full morphdom library
// is ~800 lines; we implement the core algorithm that handles the common
// cases for markdown preview: text changes, attribute changes, child
// addition/removal, and image stabilization.

// Patches the existing DOM tree to match a new HTML string. The key
// difference from innerHTML replacement is that morphdom diffs the
// existing tree against the new tree and applies minimal mutations.
// This preserves scroll position, image dimensions, and form state.
export function morphdom(
  parent: HTMLElement,
  newHtml: string,
  options?: { onBeforeNodeAdded?: (node: Node) => Node | null },
): void {
  const temp = document.createElement("div");
  temp.innerHTML = newHtml;

  morphChildren(parent, temp, options?.onBeforeNodeAdded);
}

// Recursively morphs the children of fromParent to match toParent.
function morphChildren(
  fromParent: HTMLElement,
  toParent: HTMLElement,
  onBeforeNodeAdded?: (node: Node) => Node | null,
): void {
  const fromChildren = Array.from(fromParent.childNodes);
  const toChildren = Array.from(toParent.childNodes);

  // Remove extra children from the end.
  while (fromChildren.length > toChildren.length) {
    const last = fromChildren.pop();
    if (last) fromParent.removeChild(last);
  }

  for (let i = 0; i < toChildren.length; i++) {
    const toChild = toChildren[i];
    const fromChild = fromChildren[i];

    if (!fromChild) {
      // No existing child, add the new one.
      const added = onBeforeNodeAdded?.(toChild) ?? toChild;
      fromParent.appendChild(added.cloneNode(true));
      continue;
    }

    if (toChild.nodeType === Node.TEXT_NODE) {
      // Text node: update content if changed.
      if (fromChild.textContent !== toChild.textContent) {
        fromChild.textContent = toChild.textContent;
      }
      continue;
    }

    if (toChild.nodeType === Node.COMMENT_NODE) {
      // Comment nodes: skip.
      continue;
    }

    if (
      toChild.nodeType !== Node.ELEMENT_NODE ||
      fromChild.nodeType !== Node.ELEMENT_NODE
    ) {
      // Different node types: replace.
      fromParent.replaceChild(toChild.cloneNode(true), fromChild);
      continue;
    }

    const fromEl = fromChild as HTMLElement;
    const toEl = toChild as HTMLElement;

    // Different tag names: replace.
    if (fromEl.tagName !== toEl.tagName) {
      fromParent.replaceChild(toEl.cloneNode(true), fromEl);
      continue;
    }

    // Same tag: morph attributes and children.
    morphAttributes(fromEl, toEl);

    // Skip morphing children for elements that should not be diffed.
    // Images and SVGs are replaced entirely to avoid flickering.
    if (fromEl.tagName === "IMG" || fromEl.tagName === "SVG") {
      continue;
    }

    // Preserve data-source-line attribute for scroll sync.
    const sourceLine = fromEl.getAttribute("data-source-line");

    morphChildren(fromEl, toEl, onBeforeNodeAdded);

    // Restore data-source-line if it was removed during morphing.
    if (sourceLine && !fromEl.getAttribute("data-source-line")) {
      fromEl.setAttribute("data-source-line", sourceLine);
    }
  }
}

// Morphs the attributes of fromEl to match toEl. Only changed
// attributes are updated to minimize DOM mutations.
function morphAttributes(fromEl: HTMLElement, toEl: HTMLElement): void {
  // Remove attributes that are not in toEl.
  const fromAttrs = Array.from(fromEl.attributes);
  for (const attr of fromAttrs) {
    if (!toEl.hasAttribute(attr.name)) {
      fromEl.removeAttribute(attr.name);
    }
  }

  // Add or update attributes from toEl.
  const toAttrs = Array.from(toEl.attributes);
  for (const attr of toAttrs) {
    if (fromEl.getAttribute(attr.name) !== attr.value) {
      fromEl.setAttribute(attr.name, attr.value);
    }
  }
}

// Captures the natural dimensions of all images in a container. Returns
// a map of image index to {width, height}. This is used before morphdom
// to preserve image sizes across re-renders.
export function captureImageDimensions(
  container: HTMLElement,
): Map<number, { width: number; height: number }> {
  const dims = new Map<number, { width: number; height: number }>();
  const images = container.querySelectorAll("img");

  images.forEach((img, i) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      dims.set(i, { width: img.naturalWidth, height: img.naturalHeight });
    }
  });

  return dims;
}

// Applies saved image dimensions to images in a container. This prevents
// layout shifts when images are re-rendered with the same source.
export function applyImageDimensions(
  container: HTMLElement,
  dims: Map<number, { width: number; height: number }>,
): void {
  const images = container.querySelectorAll("img");

  images.forEach((img, i) => {
    const saved = dims.get(i);
    if (saved && img.src) {
      img.style.width = `${saved.width}px`;
      img.style.height = `${saved.height}px`;
      img.style.objectFit = "contain";

      // Remove fixed dimensions after the image loads to allow
      // responsive sizing.
      img.onload = () => {
        img.style.width = "";
        img.style.height = "";
        img.style.objectFit = "";
      };
    }
  });
}
