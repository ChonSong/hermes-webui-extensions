# Desktop Companion

Desktop Companion is a trusted local companion extension for Hermes WebUI. It
watches session attention state and forwards lightweight snapshots to a local
loopback sidecar for the native desktop pet host. It does not render a browser
pet or WebUI overlay.

This entry is the first sidecar-class extension candidate for the Hermes WebUI
extension library. It keeps the WebUI-facing assets in this repository and keeps
the sidecar/native host source in:

```text
https://github.com/franksong2702/hermes-webui-desktop-companion
```

## Current Shape

```text
Hermes WebUI page
  -> manifest-bundled extension assets
  -> /extensions/assets/companion-adapter.js
  -> http://127.0.0.1:17787 loopback sidecar
  -> optional native desktop pet host
```

The extension can run in WebUI without the sidecar. In that mode it stays
invisible and quietly fails closed. When the sidecar is running, the extension
posts snapshots to `POST /api/webui/snapshot` so the desktop pet can react.

## Capabilities

This entry declares only capabilities already available to extension entries:

- `manifest-bundle`
- `loopback-sidecar`

It does not declare `sidecar-proxy`. Direct browser-to-loopback access is the
current integration model. A same-origin sidecar proxy can be added later if
Hermes WebUI core ships that capability.

## Install For Local Testing

Start Hermes WebUI with this extension directory:

```bash
cd /path/to/hermes-webui
HERMES_WEBUI_EXTENSION_DIR=/path/to/hermes-webui-extensions/extensions/desktop-companion \
HERMES_WEBUI_EXTENSION_MANIFEST=manifest.json \
./start.sh
```

Start the companion sidecar from the source repo when desktop behavior is
needed:

```bash
git clone https://github.com/franksong2702/hermes-webui-desktop-companion
cd hermes-webui-desktop-companion
npm install
npm run dev
```

Start the native desktop pet host from the same source repo when testing the
desktop surface:

```bash
npm install --prefix desktop-pet
npm run desktop:dev
```

## Disable And Uninstall

To disable the WebUI extension, restart Hermes WebUI without:

```text
HERMES_WEBUI_EXTENSION_DIR
HERMES_WEBUI_EXTENSION_MANIFEST
HERMES_WEBUI_EXTENSION_STYLESHEET_URLS
HERMES_WEBUI_EXTENSION_SCRIPT_URLS
```

To stop desktop behavior, stop the loopback sidecar and native host processes.
To uninstall the standalone source project, remove its local clone after those
processes are stopped.

## Trust And Permissions

This is trusted local code. The injected adapter runs in the Hermes WebUI
browser origin and can use the logged-in browser session.

Current disclosed behavior:

- reads the authenticated WebUI sessions API via `/api/sessions`
- reads existing WebUI localStorage keys for viewed/unread session state
- talks to a loopback sidecar at `http://127.0.0.1:17787`
- sends the local sidecar page URL/title, companion state, and current session
  attention summaries, including session titles and status text
- uses a native host for transparent windows, menus, drag behavior, and restart
  behavior when the desktop pet is launched
- serves bundled pet assets
- does not need external network access
- does not need arbitrary filesystem access

## Sidecar Contract

The sidecar binds to `127.0.0.1:17787` by default.

Health check:

```text
GET http://127.0.0.1:17787/health
```

Expected response shape:

```json
{
  "ok": true,
  "status": "ok",
  "service": "hermes-webui-desktop-companion",
  "name": "Hermes WebUI Desktop Companion",
  "version": "0.1.0",
  "sidecar": {
    "type": "loopback",
    "health_path": "/health"
  }
}
```

The sidecar metadata is descriptive. It does not imply that Hermes WebUI core
can install, auto-start, proxy, or manage the native process yet.

## Compatibility

Required WebUI surface:

- manifest-bundled extension assets
- same-origin extension asset serving under `/extensions/`
- browser access to authenticated WebUI session APIs
- loopback CSP allowance for `http://127.0.0.1:17787`

Current lifecycle declaration:

```json
{
  "webui_restart_required": false,
  "sidecar_start_required": true,
  "native_host_start_required": true,
  "native_host_autostart": "extension_owned"
}
```

Manual env-var setup may still require restarting WebUI so it rereads its
configured extension manifest. The lifecycle declaration describes the extension
capability model rather than today's manual startup mechanics.

## Verification

From this repository:

```bash
python3 -m json.tool extensions/desktop-companion/extension.json
python3 -m json.tool extensions/desktop-companion/manifest.json
node --check extensions/desktop-companion/assets/companion-adapter.js
```

From the Desktop Companion source repo:

```bash
npm test
```

Manual verification should confirm:

- WebUI loads the adapter from `manifest.json`
- no browser pet or WebUI overlay appears
- the sidecar receives `POST /api/webui/snapshot` when it is running
- `GET /health` returns `status: "ok"`
- the native desktop pet host can load from the sidecar

## Known Limitations

- No one-click install path is available yet.
- WebUI settings do not yet manage sidecar lifecycle.
- Sidecar proxy support is not declared because Hermes WebUI core has not
  shipped it.
- The native host source is linked, not vendored, in this extension entry.
