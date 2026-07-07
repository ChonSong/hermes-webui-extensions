# TOTP MFA

Optional two-factor authentication (2FA) for Hermes WebUI using Time-based
One-Time Passwords (TOTP), compatible with Google Authenticator, Authy,
Microsoft Authenticator, and any other RFC 6238 authenticator app.

## What It Does

- **Settings panel** — manage MFA from **Settings → TOTP MFA**: generate a
  TOTP secret and QR code, scan with your authenticator app, verify with a
  6-digit code, then enable 2FA. Disable 2FA anytime with password
  confirmation.

- **Login protection** (provided by the companion core PR) — after entering
  the correct password, users must provide a 6-digit TOTP code from their
  authenticator app to complete login.

- **Standard protocol** — uses TOTP (RFC 6238) with a 30-second interval and
  ±1 interval clock-drift tolerance.

## How It Works

```
Setup flow (extension panel):
  Settings → TOTP MFA → "Set up TOTP"
    → GET /api/auth/mfa/setup → shows QR code + secret key
    → Scan with authenticator app → enter 6-digit code
    → POST /api/auth/mfa/enable → MFA enabled

Login flow (core server):
  Password entry → POST /api/auth/login
    └─ If MFA disabled: session cookie set, redirect to app
    └─ If MFA enabled:  return {mfa_required, mfa_token}
      └─ TOTP code entry → POST /api/auth/mfa/verify
        └─ Code valid: session cookie set, redirect to app

Disable flow (extension panel):
  Settings → TOTP MFA → "Disable…" → enter password
    → POST /api/auth/mfa/disable → MFA removed
```

## Requirements

This extension requires **core backend support** from a companion PR in the
`hermes-webui` repo that adds `api/auth_mfa.py` and modifies the login flow.
Without that, the extension detects missing endpoints at boot and will not
inject itself.

Server dependencies:

```bash
pip install pyotp qrcode[pil]
```

QR code generation requires `qrcode[pil]`. Without it, only the text secret
key is shown (no visual QR), but setup still works by typing the key manually
into your authenticator app.

## Install

### From the extension gallery

Open **Settings → Extensions**, find **TOTP MFA**, and click **Install**.

### Manual install

```bash
cd ~/.hermes/webui/extensions
cp -r /path/to/hermes-webui-extensions/extensions/totp-mfa .
pip install pyotp qrcode[pil]
# Restart WebUI
```

### Enabling MFA

1. Install `pyotp` and `qrcode[pil]` on the server.
2. Set a WebUI password (`Settings → Change Password` or `HERMES_WEBUI_PASSWORD`).
3. Open **Settings → TOTP MFA**.
4. Click **Set up TOTP**, scan the QR code with your authenticator app,
   enter the 6-digit code, click **Verify & Enable**.
5. On your next login: password **then** the code from your authenticator app.

## Disable And Uninstall

### Disable MFA

1. Open **Settings → TOTP MFA**.
2. Expand **Disable two-factor authentication**.
3. Enter your password and click **Disable MFA**.

### Uninstall the extension

Remove the `totp-mfa/` directory from `~/.hermes/webui/extensions/`, or
uninstall from **Settings → Extensions** (gallery installs).

## Trust And Permissions

This is trusted local code. The injected JavaScript runs in the Hermes WebUI
browser origin and can use the logged-in browser session.

Disclosed behavior:

- Adds a **TOTP MFA** section to Settings (appended to `<main>`).
- Adds a sidebar navigation item in `#settingsMenu`.
- Wraps `window.switchSettingsSection` to route to the custom section;
  delegates all other sections to the original.
- Calls `GET /api/auth/mfa/status` (read MFA state).
- Calls `GET /api/auth/mfa/setup` (generate TOTP secret + QR code).
- Calls `POST /api/auth/mfa/enable` (activate MFA with verified code).
- Calls `POST /api/auth/mfa/disable` (deactivate MFA with password).
- Creates extension-owned DOM: settings section, sidebar item, setup form,
  QR code image, secret key display, code input, status messages.
- Does not access `localStorage`, cookies, filesystem, or any external network
  (all API calls are absolute same-origin paths).

All content inserted into the DOM uses `textContent` or HTML-escaped values
to prevent markup injection. Secret keys and QR code data URLs are properly
escaped.

## Compatibility

Required WebUI surface:

- Manifest-bundled extension assets under `/extensions/`
- Backend MFA endpoints (requires companion core PR)
- Settings sidebar (`#settingsMenu`) for navigation item
- `<main>` element for panel injection
- `window.switchSettingsSection` from `panels.js`
- `window.switchPanel` for settings panel activation

## Verification

```bash
node scripts/validate-extensions.mjs
node scripts/scan-extension-safety.mjs
```

Manual verification:

1. Navigate to **Settings → TOTP MFA** — see MFA status.
2. Click **Set up TOTP** — QR code and secret key appear.
3. Scan the QR code with your authenticator app.
4. Enter the 6-digit code — verify succeeds, MFA shows **Enabled**.
5. Log out — login page shows two-step flow.
6. Login with correct password + TOTP code — succeeds.
7. Login with correct password + WRONG TOTP — fails.
8. Disable MFA with password confirmation — succeeds.
9. Login again — password-only (no TOTP step).

## Backup And Recovery

If you lose your authenticator app:

```bash
python3 -c "
import json
s = json.load(open('$HOME/.hermes/webui/settings.json'))
s.pop('totp_secret', None)
s['totp_enabled'] = False
json.dump(s, open('$HOME/.hermes/webui/settings.json', 'w'), indent=2)
"
# Restart WebUI
```

**Save the text TOTP secret key** when setting up MFA. Store it in a password
manager or secure physical location.

## Known Limitations

- MFA is per-instance (WebUI is single-user by design).
- Temp token expires after 3 minutes during login — restart login if you stall.
- No backup/recovery codes in the UI yet.
- QR code needs `qrcode[pil]` on the server.
