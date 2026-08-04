# Docker & Tunnel Manager

A 7-tab management panel for Docker containers, images, volumes, and Cloudflare
tunnels inside Hermes WebUI. All operations are proxied through a **pinned
loopback sidecar** — the browser never talks to the Docker socket or Cloudflare
API directly.

## Pinned dependency

| Component | Version | Source |
|-----------|---------|--------|
| Sidecar runtime | **`v0.3.0`** (sha256: `TBD`) | `hermes-webui/docker-tunnel-sidecar` |

Do **not** clone `master` from the sidecar repo. Install only from the pinned
tag — the extension's permission model assumes the sidecar's v0.3.0 route table,
auth chokepoint, and exact-match dispatch.

## Tabs

1. **Containers** — list, start, stop, restart, view logs, per-container prune
2. **Images** — list, inspect history, remove
3. **Volumes** — list, inspect usage, remove
4. **Networks** — list, inspect
5. **Compose** — project list, per-project status
6. **Tunnels** — Cloudflare tunnel status, start/stop
7. **Settings** — sidecar origin, auto-refresh interval

## Permissions

| Scope | Why |
|-------|-----|
| `loopback_sidecar` | Talk to the local sidecar over `http://127.0.0.1:17788` |
| `network_external` | Runtime-side outbound connectivity checks + Cloudflare CLI |
| `dom.owned` + `mutates_core_views` | Render the panel as an owned overlay inside the WebUI shell |
| `storage.owned` | Persist panel state (active tab, last-selected container, refresh interval) |
| `webui_api.read: sessions` | Resolve the current session for the composer context |

The sidecar mediates **all** Docker socket access. The extension never calls
the Docker API directly.

## Security model

- The sidecar enforces a single auth chokepoint (`_dispatch`) — every
  `do_*` method runs authentication first, including `OPTIONS`.
- Routes use exact `len(parts)` match — `/api/containers/prune/extra` 404s
  instead of pruning.
- Destructive ops (container stop, container prune, volume delete) require an
  explicit confirmation dialog built from text nodes and real `<strong>` — never
  string-interpolated markup.
- `tail`/`lines` clamped to `[1, 1000]`; response bodies capped at 512 KiB with
  `truncated: true`.
- Per-request deadline ~8 s inside the ~10 s proxy envelope.

## Installation

1. Clone the **pinned** sidecar:
   ```bash
   git clone --branch v0.3.0 --depth 1 \
     https://github.com/hermes-webui/docker-tunnel-sidecar.git \
     ~/.local/share/hermes-docker-tunnel-sidecar
   ```
2. Follow `README.md` inside the sidecar repo to install the systemd unit.
3. The WebUI loads this extension as a manifest bundle — no additional native
   host install required.

## Status

- [x] `extension.json` + `manifest.json` scaffolding
- [ ] Adapter IIFE (`assets/docker-tunnel-manager.js`)
- [ ] 7-tab panel render + tab switch lifecycle
- [ ] Sidecar health polling + error states
- [ ] Containers tab (list / start / stop / restart / logs)
- [ ] Images tab (list / history / remove)
- [ ] Volumes tab (list / usage / remove)
- [ ] Networks tab (list / inspect)
- [ ] Compose tab (project status)
- [ ] Tunnels tab (Cloudflare status / start / stop)
- [ ] Settings tab (origin + refresh interval)
- [ ] Confirmation dialogs for destructive ops
- [ ] Before/after screenshots at desktop + narrow widths
