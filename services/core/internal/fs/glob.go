// Copyright (c) 2026 GordenArcher and Axon Editor Group. All rights reserved.
// Licensed under the MIT License. See LICENSE in the project root for license information.

package fs

import (
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"
)

// globRegexCache avoids recompiling the same pattern for every file in a
// workspace walk. A glob search can visit tens of thousands of entries, and
// compiling on each match turned a cheap filename filter into a CPU hotspot.
var globRegexCache sync.Map

// MatchGlob matches a workspace-relative path against a glob pattern. The
// standard filepath.Match does not understand **, which is the notation models
// use for "search every folder", so Axon converts the pattern to a regex once
// and caches the compiled result.
//
// A pattern without a slash matches at any depth. That keeps glob("*.go")
// useful without forcing every caller to remember the **/ prefix.
func MatchGlob(pattern string, name string) bool {
	pattern = normalizeGlobPattern(pattern)
	name = filepath.ToSlash(name)
	if pattern == "" || name == "" {
		return false
	}
	if !strings.Contains(pattern, "/") {
		pattern = "**/" + pattern
	}

	compiled, ok := globRegexCache.Load(pattern)
	if !ok {
		expression, err := regexp.Compile(globExpression(pattern))
		if err != nil {
			return false
		}
		globRegexCache.Store(pattern, expression)
		compiled = expression
	}

	return compiled.(*regexp.Regexp).MatchString(name)
}

func normalizeGlobPattern(pattern string) string {
	pattern = filepath.ToSlash(strings.TrimSpace(pattern))
	for strings.HasPrefix(pattern, "./") {
		pattern = strings.TrimPrefix(pattern, "./")
	}
	return pattern
}

// globExpression translates the small glob vocabulary models actually use:
// *, ?, **, and character classes. Everything else is escaped so a pattern
// like app.config.ts cannot accidentally become a regex with a wildcard dot.
func globExpression(pattern string) string {
	var expression strings.Builder
	expression.WriteString("^")

	for index := 0; index < len(pattern); index++ {
		character := pattern[index]
		if character >= utf8.RuneSelf {
			decoded, size := utf8.DecodeRuneInString(pattern[index:])
			expression.WriteString(regexp.QuoteMeta(string(decoded)))
			index += size - 1
			continue
		}
		switch character {
		case '*':
			if index+1 < len(pattern) && pattern[index+1] == '*' {
				index++
				if index+1 < len(pattern) && pattern[index+1] == '/' {
					index++
					expression.WriteString("(?:.*/)?")
				} else {
					expression.WriteString(".*")
				}
				continue
			}
			expression.WriteString("[^/]*")
		case '?':
			expression.WriteString("[^/]")
		case '[':
			end := index + 1
			if end < len(pattern) && (pattern[end] == '!' || pattern[end] == '^') {
				end++
			}
			if end < len(pattern) && pattern[end] == ']' {
				end++
			}
			for end < len(pattern) && pattern[end] != ']' {
				end++
			}
			if end >= len(pattern) {
				expression.WriteString(`\[`)
				continue
			}
			class := pattern[index : end+1]
			class = strings.Replace(class, "[!", "[^", 1)
			expression.WriteString(class)
			index = end
		case '\\':
			if index+1 < len(pattern) {
				index++
				escaped := pattern[index]
				if escaped >= utf8.RuneSelf {
					decoded, size := utf8.DecodeRuneInString(pattern[index:])
					expression.WriteString(regexp.QuoteMeta(string(decoded)))
					index += size - 1
				} else {
					expression.WriteString(regexp.QuoteMeta(string(escaped)))
				}
				continue
			}
			expression.WriteString(`\\`)
		default:
			expression.WriteString(regexp.QuoteMeta(string(character)))
		}
	}

	expression.WriteString("$")
	return expression.String()
}
