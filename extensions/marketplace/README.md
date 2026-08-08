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

Source examples live under `examples/extensions/`. To test an example through
the local marketplace, copy its complete package folder into this directory.
For example, `examples/extensions/theme/` is the authoring copy, while
`extensions/marketplace/example-theme/` would be the registry copy Axon lists
as downloadable.

Keep the marketplace copy separate from the authoring source. Installing from
this registry creates another stable copy in the user extension directory, so
editing an example does not silently mutate the package Axon is already using.
