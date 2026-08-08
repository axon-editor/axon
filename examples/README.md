# Axon Examples

These examples use the contracts in `packages/extension-api` and are kept
separate from Axon's built-in extensions.

## Extension Examples

| Example | Current behavior |
| --- | --- |
| [`extensions/theme`](extensions/theme) | Works as a user or workspace extension today. |
| [`extensions/language-metadata`](extensions/language-metadata) | Registers language metadata and snippet assets with the extension registry. Dynamic tokenizer, snippet completion, and LSP wiring are still in progress. |
| [`extensions/runtime-api`](extensions/runtime-api) | Type-checked reference for `activate(context, api)`. Executable modules are currently restricted to trusted built-ins. |

## Try A Declarative Extension

Axon discovers workspace extensions under `.axon/extensions/` inside the open
workspace. To try the theme example while developing Axon:

```bash
mkdir -p .axon/extensions
cp -R examples/extensions/theme .axon/extensions/example-theme
```

Refresh the Extensions view, then select **Circuit Night Example** in Appearance
settings. Delete `.axon/extensions/example-theme` when finished.

User extensions follow the same package shape. The Extensions view displays the
active user extension directory for the current Axon installation.

## Security Boundary

Declarative manifests, themes, language metadata, and contribution records can
be loaded from user and workspace extension roots. A manifest containing
`main` requests executable code. Axon currently rejects executable user and
workspace extensions until that code can run in a real isolated extension-host
process rather than Electron's trusted main process.

`window.axon` is Axon's internal preload bridge, not the public extension API.
Extensions should target `@axon/extension-api` so the future isolated host can
preserve the same contract without exposing Electron internals.
