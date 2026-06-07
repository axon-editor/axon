# Axon Managed Language Servers

Axon resolves native or runtime-backed language servers from this directory
before it falls back to tools installed on the user's PATH.

Use this shape:

```text
build/language-servers/
  darwin-arm64/
    java/bin/jdtls
    csharp/bin/csharp-ls
    kotlin/bin/kotlin-language-server
    ruby/bin/ruby-lsp
    lua/bin/lua-language-server
  darwin-x64/
  linux-x64/
  win32-x64/
  common/
```

`common` is only for portable launchers. Platform-specific binaries should live
under their exact `process.platform-process.arch` directory so Axon never starts
a binary built for the wrong operating system or architecture.
