# Axon Example Extension

This is a minimal Axon extension package that lives at the repository root so
extension authors can inspect a complete package without digging through built-
in implementation folders.

It demonstrates:

- `axon.extension.json` metadata
- theme contribution
- icon theme contribution
- command contribution
- sidebar view contribution
- terminal profile contribution
- an optional typed activation module

## Make It Downloadable Locally

During local registry development, copy this folder into the marketplace root:

```bash
cp -R example-extension extensions/marketplace/example-extension
```

Then open Axon's Extensions modal, switch to Downloads, and reload. Axon scans
`extensions/marketplace/**/axon.extension.json` and will show the package as an
installable extension.

The root `example-extension/` folder is the source template. The
`extensions/marketplace/` copy is the local downloadable registry package.
