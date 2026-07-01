# Axon Marketplace Registry

This folder is Axon's local development marketplace.

Packages placed here are not automatically installed. They are listed as
downloadable packages, and the Extensions modal can copy them into the user
extensions directory when the user installs them.

```text
extensions/marketplace/
  example-extension/
    axon.extension.json
```

Use this folder when testing how a third-party extension will appear in the
download list before Axon has a hosted registry service.

The source package can live anywhere, but root-level examples should stay at the
repository root. For example, `example-extension/` is the authoring copy, while
`extensions/marketplace/example-extension/` is the registry copy that Axon lists
as downloadable.
