# Project Allocator Extension

Suggests and assigns project ownership for unassigned sessions in Hermes WebUI.

## Features

- **Keyword Matching**: Suggests which project each unassigned session belongs to
  by fuzzy-matching the session title and source tag against project names
  (singular/plural, prefix, and camel-case normalization).
- **One-Click Assign**: ✓ button assigns to the suggested project immediately.
- **Project Selector**: Dropdown to pick any project per session.
- **Undo Last Action**: Rollback the most recent assignment.
- **Auto-Suggest**: Automatically runs suggestions when the panel opens.
- **Keyboard Shortcut**: `Alt+P` to toggle the panel.
- **Unassigned Badge**: A badge on the `.project-bar` chip shows how many
  sessions remain unassigned.

## Who It Is For

Users who want to keep tidy session→project organization without manually
categorizing every new conversation. The keyword engine works offline; there is
no dependency on an LLM provider at runtime.

## Usage

1. Click the 🎯 Allocator chip in the project bar (or press `Alt+P`).
2. The panel lists all unassigned sessions.
3. Click "**✨ Suggest**" to run keyword matching.
4. Each session shows a suggested project with a confidence badge.
5. Click **✓** to assign, or pick a different project from the dropdown.
6. Use **↩ Undo** to reverse the last assignment.
7. Use **🔄 Titles** to regenerate titles for all unassigned sessions (calls the
   core session-title regeneration endpoint).

## Files

```
extensions/project-allocator/
├── manifest.json              # Runtime manifest
├── extension.json             # Gallery metadata + permissions
├── README.md                  # This file
└── assets/
    ├── project-allocator.js   # Extension logic
    └── project-allocator.css  # Component styles
```

## Installation

This entry is consumed from the Hermes WebUI Extension gallery (Settings →
Extensions). From a local checkout, you can install by copying the
`project-allocator/` directory into your WebUI `extensions/` directory and (for
the gallery entry) running the registry validator:

```bash
node scripts/validate-extensions.mjs
node scripts/scan-extension-safety.mjs
node scripts/generate-registry.mjs --out dist/registry.json
```

## Disable / Uninstall

- **Disable**: toggle the extension off in Settings → Extensions → Project
  Allocator.
- **Uninstall**: remove the extension from Settings → Extensions. Undo history
  stored in the extension's owned storage is cleared with it.

## WebUI APIs And DOM Surfaces Used

- Reads `GET /api/sessions` and `GET /api/session` (to list unassigned sessions
  and, for context, the last user message of each).
- Writes `POST /api/session/move` (assign / undo) and
  `POST /api/session/title/regenerate` (title regeneration).
- Reads project data via `GET /api/projects`.
- Injects a chip into the `.project-bar` and a floating `.ext-projalloc-panel`
  overlay; does **not** mutate core message views (view-only, additive UI).
- Uses the sanctioned `window.HermesExtensionSettings` accessors
  (`settingsForExtension` / `storageForExtension`) for settings and the undo
  stack — never reads or writes core `hermes-*` keys.

## Trust Model And Permissions

Declared in `extension.json`:

- `webui_api.read`: `session`, `sessions`, `projects` — to list and inspect
  unassigned sessions and load project names for the picker/suggestions.
- `webui_api.write`: `session/move`, `session/title/regenerate` — to assign
  sessions to a project and batch-regenerate titles.
- `dom`: owned, `mutates_core_views: false` (adds its own panel + chip).
- `storage`: `owned: true` — entire extension namespace for settings + undo stack.
- `network_external`: `false` — no outbound network requests (all calls are
  same-origin `/api/...` and bundled-asset `/extensions/project-allocator/...`).
- `loopback_sidecar`: `false`, `native_host`: `false` — no local process.
- `webui_navigation`: `false` — never navigates the WebUI.

Settings are declared natively via `settings_schema`:
`suggest_on_open` (boolean) and `max_undo_stack` (integer).

## Known Limitations

- Keyword matching is heuristic; it can miss projects whose names share no
  words with a session title, or suggest a plausible-but-wrong project when
  titles are ambiguous. Suggestions are a starting point — the dropdown lets
  you override before assigning.
- Per-session last-user-message context is fetched from the session endpoint;
  large unassigned lists will make the suggestion pass slower.

## Compatibility And Verification

- Requires the WebUI extension bundle/manifest loading path and the
  `window.HermesExtensionSettings` accessors for `settings_schema` support.
- Validated with the repo-wide `validate-extensions.mjs` and
  `scan-extension-safety.mjs` gates.
- Static shape + load-cycle tests live in
  `tests/test_extension_project_allocator.py` (in the paired development
  checkout); they verify the manifest contract, permission declarations, and
  boot path without network access.