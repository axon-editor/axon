# Axon Extension API

This package is the public contract between Axon's workbench and extension
packages.

The immediate goal is to stop extension work from depending on private editor
internals. Built-in extensions and third-party extensions should describe their
capabilities through `axon.extension.json`, then Axon's extension host can turn
those declarations into commands, views, themes, icon themes, languages, agents,
terminal profiles, and tools.

## Package Shape

```text
example-extension/
  axon.extension.json
  src/
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
    "url": "https://github.com/GordenArcher/axon/tree/main/example-extension"
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

The repository root also contains `example-extension/` as a source template.
Copy it into `extensions/marketplace/example-extension/` when you want the local
registry to list it as downloadable.

## Download Flow

An extension can be visible to Axon in three different states:

- Source package: the folder an author edits, such as `example-extension/`.
- Registry package: a package listed for install, such as
  `extensions/marketplace/example-extension/`.
- Installed package: a copied package under the user extensions root.

The marketplace contract in `src/marketplace.ts` is intentionally small. Local
registry entries use `installMode: "copy"` and point at a manifest path. A future
remote registry can use `installMode: "download"` and a package URL without
changing the modal or install IPC contract.

That separation matters because editing a source package should not mutate the
installed copy that Axon is running. The install step creates a stable snapshot,
then the extension loader reads that installed snapshot on the next refresh.
