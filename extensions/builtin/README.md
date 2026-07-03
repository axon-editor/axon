# Axon Built-in Extensions

`extensions/builtin` contains Axon's first-party extension packages. These
packages are shipped with the editor and are indexed by the extension registry
from each `axon.extension.json` manifest.

## What Belongs Here

- Workbench features that behave like editor extensions, such as terminal,
  search, source control, testing, settings, previews, agent surfaces, and
  integrations.
- Theme and icon packages that contribute selectable appearance assets.
- Language packages that contribute language metadata such as ids, extensions,
  filenames, aliases, and activation events.

Core editor primitives still live in `apps/editor`. That includes the Monaco
editor surface, pane layout, file explorer shell, app orchestration, preload,
main-process IPC, and platform services. A built-in extension can consume those
APIs, but it should not own the app shell itself.

## Manifest Ownership

Every built-in extension must have an `axon.extension.json` file. The registry
uses this manifest to decide what the extension contributes:

- `contributes.commands` registers command ids.
- `contributes.views` registers workbench surfaces.
- `contributes.themes` and `contributes.iconThemes` register appearance assets.
- `contributes.languages` registers language metadata.

The manifest is the source of truth for extension discovery. Workbench code may
still be mounted by React while the extension host matures, but the mount should
resolve through the contribution registry so missing or disabled built-ins fail
closed instead of silently bypassing the extension system.

## Language Extensions

The `language-*` folders describe built-in language ownership. They do not start
language servers by themselves. Runtime language-server startup is still owned
by `apps/editor/src/main/lsp/definitions.ts`, where Axon decides whether a
server is bundled, managed, npm-backed, or provided by the user workspace.

This split is intentional:

- The built-in extension manifest tells Axon what language the editor supports.
- The LSP definition tells Axon how to launch, probe, and diagnose that
  language's server.
- Some language servers, such as Java and Kotlin, are managed bundles but still
  need a local JDK because the analysis runtime is JVM-based.

When a new language server is added, add the matching `language-{id}` manifest
in this directory so the extension registry and language-server list stay in
sync.

## Folder Shape

Use this shape for new built-ins:

```text
extensions/builtin/{extension-id}/
  axon.extension.json
  workbench/
    ...React UI, hooks, and extension-owned helpers...
```

Keep non-UI helpers under a `lib/` folder inside the built-in package. Keep UI
components near the workbench surface that owns them. If code is shared by many
extensions or belongs to the editor platform, move it to `apps/editor/src/base`,
`apps/editor/src/platform`, `apps/editor/src/services`, or another existing
shared boundary instead of duplicating it in a built-in package.
