# ProofShot

ProofShot is a trusted local Hermes WebUI extension that provides a visual regression verification panel. It integrates with the [proofshot CLI](https://github.com/AmElmo/proofshot) (v1.6+) to start/stop recording sessions, view artifact timelines, and review proof reports — all from inside the WebUI.

> **Status:** Early prototype. The extension API and sidecar contract are still evolving.

## What It Does

- Adds a **ProofShot** rail button (between Sessions and Settings).
- Clicking it opens a panel showing:
  - **Status indicator** (Idle / Ready — proofshot version / Recording)
  - **Start / Stop recording** controls
  - **Active session timer** when recording
  - **Recent artifacts** list (videos, screenshots, error logs)
- Relies on a **loopback sidecar** (`proofshot-sidecar.py`, port 17990) that shells out to the proofshot CLI.

## Architecture

```text
Hermes WebUI page
  -> manifest-bundled extension assets
  -> /extensions/assets/proofshot/proofshot.js + proofshot.css
  -> rail button -> side panel
  -> panel calls /api/extensions/proofshot/sidecar/* proxy (falls back to direct 127.0.0.1:17990)
  -> sidecar -> proofshot CLI binary at /home/sc/.hermes/node/bin/proofshot
```

## Capabilities

- `manifest-bundle`
- `loopback-sidecar`

## Prerequisites

- **proofshot CLI** (v1.6+): `npm install -g proofshot`
- **Python 3.10+** for the sidecar
- **Optional:** FFmpeg for video recording

## Install For Local Testing

```bash
cd /path/to/hermes-webui
export PROOFSHOT_SIDECAR_SCRIPT=/path/to/hermes-webui-extensions/extensions/proofshot/sidecar/sidecar.py
export PROOFSHOT_SIDECAR_PORT=17990
export PATH="/home/sc/.hermes/node/bin:$PATH"

# Start sidecar
python3 "$PROOFSHOT_SIDECAR_SCRIPT" &

# Start WebUI with extension
HERMES_WEBUI_EXTENSION_DIR=/path/to/hermes-webui-extensions/extensions/proofshot \
HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json \
./start.sh
```

Or if using the extension install manifest:

```bash
# Register in extension-install-manifest.json
{
  "proofshot": {
    "version": "0.1.0",
    "enabled": true,
    "install_dir": "/path/to/hermes-webui-extensions/extensions/proofshot",
    "sidecar_port": 17990
  }
}

# Start sidecar
python3 extensions/proofshot/sidecar/sidecar.py &

# Restart WebUI
systemctl --user restart hermes-webui-dev
```

## Controls

The extension also exposes a global API on `window.ProofshotExtension`:

- `.getStatus()` — returns `{ status, version, recording, sessionTimer }`
- `.startSession()` — starts a new recording session
- `.stopSession()` — stops and processes the current session
- `.getArtifacts()` — returns recent artifact list
- `.open()` / `.close()` — toggle the verification panel

## Disable And Uninstall

- **Disable:** Restart WebUI without the extension manifest entry, or set `enabled: false` in the install manifest.
- **Uninstall:** Remove `extensions/proofshot/` directory and its entry from the install manifest. The sidecar is a standalone process — stop it separately (`kill $(pgrep -f proofshot-sidecar)`).

## Trust And Permissions

This is trusted local code. Current disclosed behavior:

- Creates extension-owned DOM (a rail button, a side panel with status, controls, and artifact list)
- Calls the loopback sidecar on port 17990 (`permissions.loopback_sidecar: true`) which shells out to the ProofShot CLI — the CLI only accesses the local filesystem (`permissions.filesystem.arbitrary: false`, only bundled assets)
- Does NOT call WebUI HTTP APIs, access cookies, or fetch remote resources
- Does NOT use native host or eval()

## Compatibility

- manifest-bundled extension assets under `/extensions/`
- Loopback sidecar proxy via `/api/extensions/proofshot/sidecar/*`
- Left rail (`.rail`) to host the button
- Tested with proofshot CLI v1.6.0

## Verification

```bash
# Run validation
node scripts/validate-extensions.mjs

# Manual: open WebUI, click ProofShot rail button, verify panel renders
# Start a recording, check artifact list populates
# Stop recording, confirm artifact entry with timestamp
```

## Known Limitations

- Sidecar must be started separately; the extension does not autostart it.
- The WebUI sidecar proxy may have CORS limitations — the JS falls back to direct `127.0.0.1:17990` fetch when the proxy fails.
- Only one recording session at a time.
- Artifact history is workspace-local and not shared across devices.
