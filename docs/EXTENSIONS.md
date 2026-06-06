# Axon Extensions

Axon is created by Gorden Archer, and extension package examples in this
document use the same publisher identity so local packages match the project
namespace while the public extension story is still being shaped.

Axon extensions are local packages loaded from the user extension folder or the current workspace. The first extension host is intentionally data-only: Axon reads manifests and contribution files, but it does not execute arbitrary extension JavaScript.

## Locations

- User extensions: Axon's app data `extensions` folder
- Workspace extensions: `.axon/extensions`

Each extension lives in its own folder and must include `axon.extension.json`.

```txt
my-extension/
  axon.extension.json
  README.md
  themes/
    my-theme.axon-theme.json
  snippets/
    react.json
  icons/
    icons.json
```

## Manifest

```json
{
  "$schema": "https://axoneditor.com/schemas/extension/v0.1.0.json",
  "id": "gorden-archer.anysphere-theme",
  "name": "Anysphere Theme",
  "publisher": "GordenArcher",
  "version": "1.0.0",
  "description": "A dark Anysphere-inspired theme for Axon.",
  "author": "Gorden Archer",
  "categories": ["Themes"],
  "activationEvents": ["onStartup"],
  "contributes": {
    "commands": [],
    "themes": [
      {
        "id": "anysphere-dark",
        "label": "Anysphere Dark",
        "path": "./themes/anysphere.axon-theme.json"
      }
    ],
    "languages": [],
    "snippets": [],
    "icons": []
  }
}
```

## Theme Format

Axon native themes use `ui`, `syntax`, and `terminal` sections.

```json
{
  "$schema": "https://axoneditor.com/schemas/theme/v0.1.0.json",
  "id": "anysphere-dark",
  "name": "Anysphere Dark",
  "appearance": "dark",
  "ui": {
    "background": "#181818",
    "editor.background": "#181818",
    "editor.foreground": "#d6d6dd",
    "panel.background": "#181818",
    "terminal.background": "#191919"
  },
  "syntax": {
    "comment": {
      "color": "#474747",
      "fontStyle": "italic"
    },
    "keyword": {
      "color": "#83d6c5"
    },
    "function": {
      "color": "#ebc88d"
    },
    "string": {
      "color": "#e394dc"
    },
    "type": {
      "color": "#87c3ff",
      "fontWeight": 400
    }
  },
  "terminal": {
    "ansi.red": "#f14c4c",
    "ansi.green": "#15ac91",
    "ansi.blue": "#4c9df3"
  }
}
```

## Zed Theme Compatibility

Axon can load Zed-style theme JSON files that contain a top-level `themes` array. It maps common Zed UI and syntax keys into Axon tokens, then registers the original syntax scopes with Monaco where possible.

This means a theme package can start with a Zed-style file and still affect Axon's editor syntax colors without manually rewriting every token on day one.

## Security

The first extension system does not run extension code. Contributions are declarative and pass through main-process validation before the renderer sees them. Future executable extension APIs should run in a separate extension host with a restricted API surface.
