# Axon Extensions

This folder holds Axon's root-level extension packages.

User and workspace extension packages are currently declarative: manifests can
contribute themes, icons, language metadata, views, commands, snippets, and
provider metadata. Trusted built-ins can also use the typed
`activate(context, api)` runtime. Axon does not execute arbitrary third-party
extension code in Electron's main process or renderer; that remains disabled
until the isolated extension-host process is complete.

Renderer and core code may still own the implementation for a built-in feature
while that feature's manifest lives here. That is intentional during migration:
the manifest establishes feature ownership first, then the implementation can
move behind that boundary in smaller, reviewable steps.

The public contract for these packages starts in
`packages/extension-api`. New contribution points should be added there first,
then wired into the editor or service that consumes them. That keeps built-ins
and third-party packages speaking the same API instead of importing private
workbench files directly.

Authoring examples live under [`../examples/extensions`](../examples/extensions).
The working theme example can be copied into `.axon/extensions/` in an open
workspace. The runtime example is a type-checked contract reference and clearly
documents the current trusted-code restriction.
