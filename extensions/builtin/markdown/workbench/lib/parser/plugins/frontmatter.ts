/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Token, MarkdownPlugin } from "../types";

// Extracts YAML frontmatter from the beginning of a markdown document.
// Frontmatter is delimited by --- at the start and end. The plugin
// strips the frontmatter tokens from the output so the renderer
// does not display raw YAML.

export function extractFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown> | null; content: string } {
  const trimmed = content.trimStart();

  // Frontmatter must start with --- on the very first line.
  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, content };
  }

  // Find the closing ---.
  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { frontmatter: null, content };
  }

  const yamlContent = trimmed.slice(3, endIdx).trim();
  const remainingContent = trimmed.slice(endIdx + 4).trimStart();

  // Parse the YAML. We use a simple key-value parser instead of
  // importing a full YAML library. This handles the common cases
  // without adding a dependency.
  const data = parseSimpleYaml(yamlContent);

  return { frontmatter: data, content: remainingContent };
}

// Simple YAML parser that handles flat key-value pairs, arrays,
// and nested objects. Does not handle all YAML syntax, but covers
// the frontmatter patterns used in markdown files.
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments.
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Array item: starts with - followed by a space.
    if (trimmed.startsWith("- ") && currentKey) {
      if (currentArray === null) {
        currentArray = [];
      }
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // If we were collecting an array and hit a non-array line, flush it.
    if (currentArray !== null && currentKey) {
      result[currentKey] = currentArray;
      currentArray = null;
    }

    // Key-value pair: key: value.
    const kvMatch = /^(\w[\w-]*):\s*(.*)/.exec(trimmed);
    if (kvMatch) {
      // Flush any previous value.
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join("\n").trim();
      }

      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === "") {
        // Value might be on the next lines (multiline string or array).
        currentValue = [];
      } else {
        result[currentKey] = parseYamlValue(value);
        currentValue = [];
        currentKey = null;
      }
      continue;
    }

    // Continuation of a multiline value.
    if (currentKey) {
      currentValue.push(line);
    }
  }

  // Flush any remaining value.
  if (currentKey) {
    if (currentArray !== null) {
      result[currentKey] = currentArray;
    } else if (currentValue.length > 0) {
      result[currentKey] = currentValue.join("\n").trim();
    }
  }

  return result;
}

// Parses a YAML scalar value into its appropriate JavaScript type.
function parseYamlValue(value: string): unknown {
  // Boolean values.
  if (value === "true") return true;
  if (value === "false") return false;

  // Null.
  if (value === "null" || value === "~") return null;

  // Number.
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  // Quoted string.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Inline array: [item1, item2, item3].
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim());
  }

  // Unquoted string.
  return value;
}

// Plugin that strips frontmatter tokens from the output. The frontmatter
// data is extracted separately by the parser and passed to the renderer.
export function frontmatterPlugin(): MarkdownPlugin {
  return {
    name: "frontmatter",
    transformBlock: (tokens: Token[]) =>
      tokens.filter((t) => t.type !== "frontmatter"),
  };
}
