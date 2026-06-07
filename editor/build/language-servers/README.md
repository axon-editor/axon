# Axon Managed Language Servers

Axon resolves native or runtime-backed language servers from this directory
before it falls back to tools installed on the user's PATH.

Use this shape:

```text
build/language-servers/
  darwin-arm64/
    go/bin/gopls
    rust/bin/rust-analyzer
    cpp/bin/clangd
    java/bin/jdtls
    csharp/bin/OmniSharp
    kotlin/bin/kotlin-language-server
    lua/bin/lua-language-server
  darwin-x64/
  linux-x64/
  win32-x64/
  common/
```

`common` is only for portable launchers. Platform-specific binaries should live
under their exact `process.platform-process.arch` directory so Axon never starts
a binary built for the wrong operating system or architecture.

Release builds run `npm run build:language-servers` on each GitHub Actions
runner before Electron packaging starts. That means the generated bundle is
included in the uploaded release asset for that platform, while these generated
binary directories stay ignored in the source repo to avoid committing large
third-party tool archives.
