# Chat Tiling

Multi-session tiling layouts for Hermes WebUI — split your chat panel into a
grid of session snapshots. Each tile holds a session context (messages, model,
streaming state); only the focused tile uses the shared composer and live model
context. Great for comparing agent outputs side-by-side, keeping a reference
conversation visible while you work elsewhere, or monitoring multiple sessions
as static snapshots.

## What It Does

- **Layouts** — 2-column (horizontal split), 4-corner (2×2 grid), 6-tile (3×2 grid)
- **Session snapshots** — each tile renders a session's messages via `window.renderTranscript()`
- **Focus switching** — click any tile to make it the active composer/model context; the outgoing tile's state is saved, the incoming tile's session is loaded via `window.loadSession()`
- **Maximize** — expand one tile to fill the entire grid; restore with one click
- **Session restore** — click any sidebar session to load it into the next empty tile (when auto-tile is enabled)
- **Graceful close** — cancels in-flight streaming before removing the tile

## How It Works

```
Sidebar click → registerHermesSessionOpenHandler (preload phase: reserve empty tile)
                                        (loaded phase: fill tile with session data)
  → tiling extension fills next empty tile
  → tile gets its own session context (sid/messages/model)
  → only the focused tile drives the shared composer

Toolbar button → showGrid(cols, rows)
  → create #ext-tile-grid as absolute overlay inside #messages
  → build N tile elements (empty containers)
  → focus first tile (transparent, shows live #msgInner beneath)
  → non-focused tiles render renderTranscript snapshots (opaque overlay)
```

The extension uses three stable WebUI public APIs:

- `window.registerHermesSessionOpenHandler(fn)` — fires on session open; routes
  clicks to empty tiles when the grid is active.
- `window.renderTranscript(container, messages, opts)` — renders a message array
  into any container using the sanitized markdown pipeline.
- `window.loadSession(sid)` — swaps Core's live session state when focusing a tile.

## Architecture

The extension uses a **single-live-session** model: Core owns one `S` object,
one composer, and one live model/run context. Only the focused tile can safely
own it. Non-focused tiles are rendered snapshots — they display messages but
do not drive the live context.

Key invariants:
- **#messages stays visible** — Core owns scroll, pagination, virtualization
- **#msgInner stays in #messages** — never detached, never moved
- **Grid is an overlay** — absolute-positioned inside #messages
- **Focused tile = transparent window** — shows live #msgInner beneath
- **Non-focused tiles = opaque snapshots** — cover #msgInner beneath
- **focusTile() calls loadSession(tile.sid)** — actually swaps Core's session state
- **switchLayout() rearranges grid only** — doesn't touch #msgInner
- **hideGrid() removes overlay** — focused tile's session stays as the live session

```text
┌─────────────────────────────────────────────┐
│  Toolbar (2 | 4 | 6 | ✕) in .app-titlebar   │
├─────────────────────────────────────────────┤
│  #messages (visible, Core owns scroll)      │
│  ┌─────────────────────────────────────────┐│
│  │ #msgInner (live session content)        ││
│  │                                         ││
│  ├─────────────────────────────────────────┤│
│  │ #ext-tile-grid (absolute overlay)       ││
│  │  ┌──────────┐  ┌──────────┐            ││
│  │  │  Tile 1  │  │  Tile 2  │            ││
│  │  │(focused) │  │(snapshot)│            ││
│  │  │transparent│  │  opaque  │            ││
│  │  └──────────┘  └──────────┘            ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

Each tile holds `{ id, sid, session, messages, busy, activeStreamId, maximized, cv, mv }`.
Switching focus calls `loadSession()` to swap Core's session, then restores the
incoming tile's composer value + model selection.

## Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `auto_tile` | boolean | `true` | Auto-fill tiles on sidebar session click |
| `show_sidebar_badges` | boolean | `true` | Show active-tile-count badges in sidebar |
| `preload_timeout_ms` | number | `5000` | Time (ms) before a reserved tile slot is released if the session doesn't load |

## Install For Local Testing

```bash
cd /path/to/hermes-webui
HERMES_WEBUI_EXTENSION_DIR=/path/to/hermes-webui-dev/extensions/chat-tiling \
HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json \
./start.sh
```

Or register in your dev state dir's `extension-install-manifest.json` and restart.

## Requirements

Hermes WebUI **≥ 2026.07.18** (the release that shipped
`registerHermesSessionOpenHandler` and `renderTranscript` as public APIs).
The extension loads and safely no-ops on older versions (feature-detected).

## Capabilities

- `manifest-bundle`