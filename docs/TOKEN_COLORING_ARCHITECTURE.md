# Axon Token Coloring Architecture

This document exists because syntax color took too long to get right, and I do
not want to lose the debugging trail. Axon should feel rich when I open code.
If a theme looks good in another serious editor and the same theme looks flat in
Axon, that is not a small cosmetic problem. It makes the editor feel unfinished.

I kept comparing Axon against the same Ayu and One theme data, and every weak
token felt like proof that something deeper was wrong. JSX tags were not rich
enough. TypeScript types stayed plain. Go member access lost color. Python
imports became white. HTML inside TSX looked nothing like real HTML. Some tokens
were technically colored, but the full file still did not have that serious IDE
feel.

## Where I Started

The first assumption was that the theme files were wrong.

That was the obvious place to start because the final symptom was visual. If a
token is white when I expect blue, gold, green, or muted gray, the theme looks
like the first suspect. So I checked the imported Ayu data, checked the One data,
checked the Axon theme conversion, checked the generated Monaco rules, and kept
asking why the editor still looked weaker than the same theme elsewhere.

That assumption was only partly true. Some Axon syntax aliases were missing, so
theme scopes from imported Ayu and One could exist without being routed into a
token name Monaco understood. Axon now keeps a capture registry that maps the
design-level syntax names into Monaco, TextMate, and semantic-token-facing
names. That registry is where broad names such as `function`, `type`,
`property`, `tag`, `punctuation.bracket`, `diff.plus`, and `diff.minus` are
connected to the lower-level scopes emitted by tokenizers.

The important lesson from that first pass was this: a good theme is not enough.
The editor must produce useful token identities before the theme can paint them.

## Monaco Alone Was Not Enough

The second assumption was that Monaco's normal tokenizer would be enough if the
theme mapping was correct.

That was wrong.

Monaco's Monarch tokenizers are fast and useful, but they are not a complete
TextMate grammar pipeline. They often emit broad classes like `identifier`,
`delimiter`, or `other`, especially in JS, TS, TSX, JSX, and embedded languages.
When the tokenizer only says "identifier", the theme cannot magically know
whether that word is a type, a component, a property, a function, a module, or a
normal variable.

This is why Axon kept falling back to white or generic foreground colors even
when the active theme had the right syntax colors. The theme had a color for
`type`, but Monaco was only giving Axon `identifier`. The theme had a color for
`property`, but Go and Python member access could still land as a plain
identifier. HTML embedded inside TSX could become too generic because the base
token stream did not preserve enough grammar meaning.

That made it clear that relying on Monaco's default tokenization would keep Axon
stuck at a shallow color layer.

## The Monaco GitHub Trail

The important turn was checking Monaco's own issue history instead of only
checking Axon's code. That changed how I looked at the problem.

I had been treating the weak coloring like something I had to fix only inside
the theme mapping. Then the GitHub issue trail showed that Monaco has had
long-running semantic-token and theme-paint edge cases going back to 2020. The
specific issue that confirmed it was
[microsoft/monaco-editor#1833](https://github.com/microsoft/monaco-editor/issues/1833),
`Semantic highlighting does not appear to work (due to theming)`.

That issue was opened on February 14, 2020. It is still open, labeled as a
probable Monaco bug by the VS Code team, tagged under `semantic-tokens`, and
sitting in the Backlog milestone. The reproduction is painfully close to the
kind of thing Axon was fighting: semantic tokens are provided, but the expected
theme highlight does not show up.

That matters because it means the problem was not just that Axon had a bad local
mapping. Monaco's editor core can receive token information and still fail to
apply the final theme color in the way a full IDE expects.

That explained the strange behavior I kept seeing:

- The token inspector could show the expected semantic color.
- The active theme could have the right syntax key.
- Monaco could still render the token with a generic fallback class.
- A token could look correct in one language or one file type, then fall back to
  weak coloring in another.
- Bracket pair colorization could repaint over an otherwise correct token.
- Embedded syntax could look fine in `.html` files but weak inside TSX/JSX.

Before checking Monaco's issue history, every failure looked like an Axon bug in
the same place. After checking it, the architecture decision became clearer:
Axon should not depend on Monaco's built-in semantic paint path as the only
source of truth. Monaco remains the editor, but Axon needs to own the final rich
coloring pass when Monaco's own paint path does not apply the theme correctly.

That is why the solution became an Axon-controlled semantic decoration layer.
The decoration layer is not a hack around a single token. It is the boundary
that lets Axon keep Monaco's editor engine while still controlling the final
visual result like a serious editor.

## LSP Semantic Tokens Helped, But Did Not Finish It

The third pass was LSP semantic tokens.

That was the right direction because language servers understand symbols better
than a simple tokenizer. TypeScript can say "this is a class", "this is a
property", "this is a function", and "this is a parameter". Other servers can do
similar work depending on the language and implementation.

But semantic tokens still did not solve the whole editor color problem:

- LSP semantic tokens arrive asynchronously.
- Not every language server gives the same amount of semantic detail.
- Embedded syntax is still a separate problem.
- Monaco's own semantic theming path did not consistently repaint the tokens the
  way Axon needed.
- A token can still be useful visually even when the language server does not
  classify it.

So LSP became one layer in the architecture, not the whole architecture. This is
also why Axon does not wait forever for LSP before a file feels readable. If the
language server is slow, restarts, or temporarily fails during workspace startup,
TextMate and Axon fallbacks still have to carry the visible editor.

## The Layered Pipeline

That is when Axon moved to a layered pipeline instead of trusting one system.

The current rule is simple: Axon does not wait for one perfect source. It
combines all available sources, then paints the best result it has.

The pipeline is:

- Theme imports produce Axon syntax tokens.
- The capture registry maps those syntax tokens to Monaco, TextMate, and
  semantic-token names.
- Monaco still provides the base editor model, tokens, cursor, layout, and
  editing behavior.
- LSP semantic tokens add symbol-level knowledge when the server is ready.
- TextMate/Shiki grammars add real grammar scopes where Monaco's Monarch
  tokenizer is too shallow.
- Axon's semantic decoration layer paints the final rich colors directly over
  Monaco ranges when Monaco's built-in paint path is not strong enough.
- Language-specific fallback rules fill practical gaps such as Go member access,
  Python imports, Python aliases, and method/property chains.

This architecture exists because no single layer is reliable enough by itself.
Monaco is still the editor. LSP is still the semantic source when it is
available. TextMate is still the richer grammar source. Axon's job is to merge
them into one visible color result without waiting forever or flashing between
weak and strong colors.

The most important part of this decision is ownership. Monaco owns editing.
Axon owns the IDE experience. If Monaco gives Axon enough information and paints
it correctly, good. If Monaco gives Axon weak tokens, LSP and TextMate improve
them. If Monaco has the correct token but does not paint it the way the active
theme expects, Axon's decoration layer applies the final visual result.

## The Part That Made It Look Hopeless

The most annoying part was that the architecture still looked broken after the
TextMate layer was added.

The code was loading grammar modules. The capture registry was expanded. Semantic
decorations were being generated. The token inspector could show expected
colors. The renderer had theme data. The active theme syntax count looked right.
But the editor still looked flat.

That made it look like the mapping was still wrong, or Monaco was still
overriding the paint, or the decoration layer was not being applied. It was
frustrating because every individual piece looked reasonable, but the visible
editor still did not match the result I was trying to get.

This is the part I want documented clearly because it is the easiest mistake to
repeat later. When the final color is wrong, it is tempting to change the theme
again, add another token alias, or special-case one language. But at this stage
the architecture itself was already close. The missing piece was proving which
runtime layer had failed.

At that point, guessing from screenshots was not enough. Axon needed proof from
inside the editor.

## The Inspector Changed The Debugging

The breakthrough was adding real diagnostic fields to the token inspector.

The inspector now reports:

- The file path and language id.
- The Monaco model token and language.
- The rendered token class.
- The active theme id.
- The number of active syntax rules.
- The semantic token type and modifiers.
- The semantic token range.
- The semantic selector used by Axon.
- The expected semantic color.
- The semantic decoration class name.
- Whether the TextMate highlighter is ready.
- Any TextMate highlighter error.
- The capture matches Axon thinks should apply.

That changed the debugging from "this looks wrong" to "this exact layer is
missing". It also made it possible to see when the expected capture was correct
but the rendered token was still coming from Monaco's fallback path.

The inspector became the safety tool for this entire feature. I do not want to
debug syntax color by eye only again. Screenshots are useful for comparison, but
the inspector tells me whether the failure is theme import, capture mapping,
Monaco tokenization, LSP semantic tokens, TextMate grammar loading, CSP, or final
decoration paint.

## The Real Blocker Was The HTML CSP

The inspector finally exposed the blocker: the TextMate engine was not ready.

The error was not a bad theme. It was not an empty syntax map. It was not that
the decoration code had no colors. Electron's renderer HTML
Content-Security-Policy blocked WebAssembly compilation, so the inlined
Oniguruma engine could not start.

That was the part that made the previous attempts feel insane. The architecture
was moving in the right direction, but the grammar engine was blocked by the
HTML CSP before it could do the work.

The fix was to make the renderer CSP explicitly allow the WebAssembly path the
inlined Oniguruma engine needs. After that, the TextMate highlighter became
ready, semantic decorations started receiving real grammar data, and TSX/JSX
finally jumped from flat Monaco tokens to rich Axon colors.

That was the moment the pipeline proved itself.

This was painful because the symptom still looked like a theme failure. The
actual failure lived in the renderer HTML policy. The grammar engine needed
WebAssembly. The HTML Content-Security-Policy blocked that WebAssembly path.
Without the token inspector, I could have kept changing color maps forever and
still not fixed the real issue.

## Monaco Bracket Coloring Also Had To Be Controlled

Axon also had to handle Monaco's bracket pair color layer.

Monaco can add `bracket-highlighting-*` classes that override the token color,
so a bracket could become bright blue even when the active theme expected a
muted bracket color. That made the inspector confusing because the token mapping
could be correct while the rendered bracket color came from Monaco's bracket
pair colorization.

Axon now maps all bracket pair foreground slots back to the active theme's
bracket token so bracket highlighting does not fight the theme.

## Language Fallbacks Matter

Python exposed a different gap. The TextMate grammar can identify an import
line, but imported aliases and class-like names still needed practical semantic
fallbacks. Axon now promotes Python import names, aliases, class-like
identifiers, constructors, `self`, `cls`, and member access into stronger token
types. That turns imports such as `ValidationError as DRFValidationError` into
useful color instead of plain white fallback.

Go exposed the same kind of member-access problem. In code such as
`h.applicationService.GetByID(c.Request.Context(), c.Param("id"), "")`, the
receiver and ordinary values can remain variable-colored, but fields like
`applicationService` and `Request` should read as properties, while calls like
`GetByID`, `Context`, and `Param` should read as functions. Axon now has a shared
member-access fallback for the languages where this pattern matters.

This matters because rich coloring is not only about grammars. It is also about
the practical cases I notice while writing real code.

The fallback layer should stay targeted. It should not become a random list of
theme overrides. A fallback belongs here when a language repeatedly produces a
weak but recognizable token pattern and the richer classification is obvious
from local syntax. Go member chains and Python import aliases are good examples.
Guessing arbitrary symbol meaning without syntax evidence is not.

## The Architecture I Want To Keep

The working architecture is:

- Monaco tokens are the baseline.
- TextMate scopes improve grammar richness.
- LSP semantic tokens improve symbol meaning.
- Axon fallbacks repair common high-value gaps.
- Axon decorations apply the final paint where Monaco's built-in semantic paint
  path is not enough.
- The token inspector proves which layer produced the final result.

Future language improvements should add better grammar coverage, better
semantic mapping, or targeted fallbacks inside this pipeline. They should not go
back to scattered one-off color overrides or theme-specific hacks.

The goal is that Ayu, One, and every future imported theme can define rich
syntax once, and Axon routes those colors through a consistent editor pipeline.

## Debugging Checklist

When syntax color looks wrong again, I should not restart this whole pain cycle
from zero. The order is:

1. Open the token inspector on the weak token.
2. Check the active theme id and active syntax count.
3. Check whether TextMate is ready or reporting an error.
4. Check the Monaco model token and rendered class.
5. Check whether LSP semantic tokens exist for that range.
6. Check the semantic selector and expected color.
7. Check whether a bracket or decoration class is overriding the visible color.
8. Add a capture alias only if the theme has the right syntax key but Axon does
   not route the emitted token to it.
9. Add a language fallback only if the grammar/LSP consistently misses a
   high-value local syntax pattern.
10. Treat Monaco's built-in semantic paint path as helpful but not authoritative.

This is the guardrail. Axon should keep getting richer without turning syntax
highlighting into scattered theme-specific patches.
