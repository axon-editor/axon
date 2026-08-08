# Runtime Extension API

This example exercises the typed `@axon/extension-api` runtime contract:

- command registration and command-to-command execution;
- terminal profile registration;
- debug configuration resolution;
- cancellable workspace indexing registration;
- lifecycle cleanup through `context.subscriptions`.

Build the shared API first, then type-check or compile the example:

```bash
npm run build:extension-api
npx tsc -p examples/extensions/runtime-api/tsconfig.json --noEmit
npx tsc -p examples/extensions/runtime-api/tsconfig.json
```

The compiled `dist/extension.js` matches the manifest's `main` entry. Do not
install this folder as a user or workspace extension yet: Axon deliberately
rejects executable third-party modules until the isolated extension-host
process is complete. Trusted built-ins use this same API contract today.
