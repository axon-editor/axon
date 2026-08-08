# Axon Extension API

This package is the public contract between Axon's workbench and extension
packages.

The immediate goal is to stop extension work from depending on private editor
internals. Built-in and third-party packages describe capabilities through
`axon.extension.json`; trusted built-ins can additionally implement the typed
`activate(context, api)` runtime contract.

## Package Shape

```text
my-extension/
  axon.extension.json
  src/                       # executable modules are trusted-built-in only today
  themes/
  icons/
```

## Manifest

```json
{
  "id": "axon.example-extension",
  "name": "Example Extension",
  "publisher": "Axon",
  "version": "1.0.0",
  "kind": "theme",
  "repository": {
    "type": "git",
    "url": "https://github.com/axon-editor/axon/tree/main/examples/extensions/theme"
  },
  "activationEvents": ["onStartup"],
  "contributes": {
    "themes": [
      {
        "id": "axon-example-dark",
        "label": "Axon Example Dark",
        "path": "themes/example-dark.json"
      }
    ]
  }
}
```

## Registry Roots

Axon discovers extensions from these roots:

```text
extensions/builtin/**/axon.extension.json
extensions/marketplace/**/axon.extension.json
$userData/extensions/**/axon.extension.json
workspace/.axon/extensions/**/axon.extension.json
```

`extensions/marketplace` is the local development registry. Packages listed
there are downloadable; installing a package copies it into the user extensions
root, where the normal loader treats it like any other installed extension.

Working source examples live under `examples/extensions/`. Copy a declarative
example into a workspace's `.axon/extensions/` folder for direct discovery, or
into `extensions/marketplace/<package-name>/` when testing the local install
flow.

## Download Flow

An extension can be visible to Axon in three different states:

- Source package: the folder an author edits, such as
  `examples/extensions/theme/`.
- Registry package: a package listed for install, such as
  `extensions/marketplace/example-theme/`.
- Installed package: a copied package under the user extensions root.

The marketplace contract in `src/marketplace.ts` is intentionally small. Local
registry entries use `installMode: "copy"` and point at a manifest path. A future
remote registry can use `installMode: "download"` and a package URL without
changing the modal or install IPC contract.

That separation matters because editing a source package should not mutate the
installed copy that Axon is running. The install step creates a stable snapshot,
then the extension loader reads that installed snapshot on the next refresh.

## Runtime Status

`src/runtime.ts` defines `ExtensionContext` and `AxonExtensionApi`. Runtime
commands execute for trusted built-in extensions today. Terminal, debug, view,
and workspace-index providers can register ownership and appear in runtime
diagnostics, while their full provider execution paths are still being built.

Executable user and workspace extensions are intentionally rejected. Running a
third-party `main` module inside Electron's trusted main process would give it
the application's privileges, so Axon will enable that path only through an
isolated extension-host process. See
[`../../examples/extensions/runtime-api`](../../examples/extensions/runtime-api)
for a type-checked API example and the current limitation.
