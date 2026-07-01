# Axon Extensions

This folder holds Axon's root-level extension packages.

The current extension host is declarative: manifests can contribute themes,
icons, language metadata, views, commands, snippets, and provider metadata, but
Axon does not execute arbitrary extension code in the renderer. Built-in
packages live under `extensions/builtin` so product features can migrate toward
an IDE-grade extension boundary without moving every implementation in one
large change.

Renderer and core code may still own the implementation for a built-in feature
while that feature's manifest lives here. That is intentional during migration:
the manifest establishes feature ownership first, then the implementation can
move behind that boundary in smaller, reviewable steps.

The public contract for these packages starts in
`packages/extension-api`. New contribution points should be added there first,
then wired into the editor or service that consumes them. That keeps built-ins
and third-party packages speaking the same API instead of importing private
workbench files directly.
