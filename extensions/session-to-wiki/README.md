# Session to Wiki

Save Hermes sessions as wiki pages. Adds an "Add to Wiki" button to session menus and a Ctrl+Shift+W keyboard shortcut.

## How it works

- Uses core's `registerHermesSessionOpenHandler` hook to track the active session
- Calls core's `POST /api/wiki/page` endpoint to save
- Renders a smart-default modal with page name + section picker
- On conflict (409), morphs to "Append to bottom" with timestamped divider

## Activation

The extension auto-activates when both:
1. Hermes WebUI core has the `registerHermesSessionOpenHandler` hook (PR #5508)
2. The wiki endpoint is configured (`/api/wiki/page`)

## Files

| File | Purpose |
|------|---------|
| `assets/session-to-wiki.js` | Extension logic — hook registration, modal, shortcut |
| `assets/session-to-wiki.css` | Modal styling |
| `extension.json` | Extension metadata |
| `manifest.json` | Runtime loader manifest |
