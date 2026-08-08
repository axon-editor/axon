# Language Metadata Extension

This example declares a fictional `.axn` language, its editor configuration,
and a snippet asset. Axon discovers these records and displays them in extension
diagnostics today.

The current public host does not yet register a third-party tokenizer, inject
these snippets into Monaco completion, or start an extension-provided language
server. Those capabilities need dedicated contribution contracts and isolated
runtime execution. This example documents the current manifest shape without
claiming that metadata alone provides syntax highlighting or LSP intelligence.
