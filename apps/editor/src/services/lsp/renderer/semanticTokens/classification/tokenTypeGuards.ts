/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A dot promotes an identifier to a property or method, but the same character
// shape appears inside strings, comments, and numbers. Shell and dotenv values
// are the clearest example: those grammars emit one string token per character,
// so applying member access to string tokens painted the character after every
// dot with the property color. Only identifier-like classifications may enter
// the member-access branches.
const identifierLikeTokenTypes = new Set([
  "attribute",
  "builtinType",
  "class",
  "constant",
  "constructor",
  "decorator",
  "enum",
  "enumMember",
  "function",
  "interface",
  "label",
  "macro",
  "method",
  "module",
  "namespace",
  "parameter",
  "property",
  "selfKeyword",
  "struct",
  "trait",
  "type",
  "typeAlias",
  "typeParameter",
  "variable",
  "variant",
]);

export function isIdentifierLikeTokenType(tokenType: string) {
  return identifierLikeTokenTypes.has(tokenType);
}
