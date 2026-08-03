# Browser compatibility smoke

The first compatibility-certification stage runs a real Hermes WebUI Core
checkout and headless Chromium. It is deliberately an allowlist, not a claim
that every changed extension has browser coverage.

## Current contract

The allowlist currently contains the merged `mobile-conversations` extension.
The smoke starts Core's `server.py` with an isolated `HERMES_HOME`,
`HERMES_WEBUI_STATE_DIR`, workspace, and agent stub, then uses a free
non-production localhost port. It strips API-key/password variables and never
sends a chat or requires a provider/model.

At a 390x844 mobile viewport, the positive case requires all of the following:

- the extension's JavaScript and stylesheet are requested successfully;
- Core's extension host (`.messages-shell`, named by the reference README) is
  visible before entry assertions begin;
- the extension-owned `#mobileConversationsBtn` is visible;
- its extension-owned `data-hwx-mobile-conversations="1"` marker is present;
- its extension-owned `aria-label="Open conversations"` is present;
- the extension-owned runtime marker reports version `0.1.1`;
- the extension-owned ARIA shortcut menu has the four documented actions.

The negative fixture injects a JavaScript resource and stylesheet but has no
entry. The same entry assertion must time out; the smoke records that expected
failure as a pass. This prevents a CI green from meaning only that an asset URL
returned HTTP 200. The fixture lives under
`tests/compatibility/fixtures/mobile-conversations-resource-only/` and is not a
shipped extension.

Assertions use the extension's own id/data/ARIA surfaces. The Core host
selector is only a readiness precondition, not the extension pass/fail oracle;
Core remains the real host that serves the app shell and injected assets.

## Local run

Install the same minimal Core browser-smoke dependency (`pyyaml`) and the
test-only browser dependency in an isolated environment, then install Chromium:

```bash
python3.12 -m pip install "pyyaml>=6.0"
python3.12 -m pip install -r tests/compatibility/requirements.txt
python3.12 -m playwright install --with-deps chromium
```

Run with an explicit independent Core checkout:

```bash
HERMES_CORE_DIR=/path/to/hermes-webui \
COMPATIBILITY_EVIDENCE_DIR="$PWD/compatibility-evidence" \
python3.12 tests/compatibility/browser_smoke.py
```

The command exits `0` only when the normal reference case passes and the
resource-only case detects the missing entry. Evidence includes
`compatibility-results.json`, one server log per case, and screenshots when the
browser reaches the relevant page.

## CI boundary

The `browser-compatibility` job checks out `nesquena/hermes-webui` independently
at the pinned, maintainer-verified Core SHA in
`.github/workflows/extensions.yml` (`320789ae596a3963d726d90f6c7f3bc86f7f2d6d`),
installs only Core's browser-smoke dependency (`pyyaml>=6.0`) plus the one
test-only Playwright dependency, and uploads `compatibility-evidence/**` with
`if: always()`. It runs on pull requests whenever extension code, the smoke,
fixture, docs, or workflow changes. The existing registry/safety job remains a
separate gate.

To update the pin, first rerun this smoke against the candidate Core checkout,
review the logs/screenshots/results, then change the SHA and repeat the CI
verification. Do not replace the pin with a moving branch reference.

Adding another reference requires a merged entry, an explicit `ReferenceSpec`
allowlist item, an extension-owned id/ARIA observable, and a positive plus
resource-only negative scenario. Until then, this stage covers only
`mobile-conversations`; it does not certify all 16 entries or every changed
extension.

The Playwright requirement is kept in `tests/compatibility/requirements.txt`
because a real browser is necessary to execute injected JavaScript. Removing
the browser job and that file is the rollback path; the existing static/schema
checks remain unchanged.
