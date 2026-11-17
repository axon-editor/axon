/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as monaco from "monaco-editor";

export function registerMonacoDotenvLanguage(
  monacoInstance: typeof monaco = monaco,
) {
  if (
    monacoInstance.languages
      .getLanguages()
      .some(({ id }) => id === "dotenv")
  ) {
    return;
  }

  monacoInstance.languages.register({
    id: "dotenv",
    aliases: ["dotenv", "env", "dotenv file"],
    extensions: [".env"],
    filenames: [".env"],
  });

  // Dotenv has no parens or block structures, so only the string pairs matter
  // for editing behavior. `#` is the only comment syntax.
  monacoInstance.languages.setLanguageConfiguration("dotenv", {
    comments: { lineComment: "#" },
    autoClosingPairs: [
      { open: '"', close: '"', notIn: ["string", "comment"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: "${", close: "}" },
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  // One whole-line match keeps the tokenizer stateless, which matters because
  // a dotenv value always ends at the newline. The key is emitted as a Monaco
  // property token so the same capture aliases used by the editor paint it as a
  // property. Value refinement (numbers, booleans, interpolation) happens in
  // the TextMate layer; this baseline only needs the immediate first paint.
  monacoInstance.languages.setMonarchTokensProvider("dotenv", {
    defaultToken: "",
    tokenizer: {
      root: [
        [/^\s*#.*$/, "comment"],
        [
          /^(\s*)(export)(\s+)([A-Za-z_][\w.-]*)(\s*)(=)(.*)$/,
          [
            "",
            "keyword",
            "",
            "support.type.property-name",
            "",
            "operator",
            "string",
          ],
        ],
        [
          /^(\s*)([A-Za-z_][\w.-]*)(\s*)(=)(.*)$/,
          [
            "",
            "support.type.property-name",
            "",
            "operator",
            "string",
          ],
        ],
        [/[^\n]+/, ""],
      ],
    },
  });
}
