# Hermes WebUI Extensions

Community extension library for Hermes WebUI.

- **Registry**: Safety-gated CI pipeline reviews and publishes extensions to the WebUI marketplace.
- **Extensions**: UI panels, tools, diagnostics, and workspace helpers.
- **Sidecars**: Optional local integrations (native desktop helpers, tunnel managers).

## Local test

```
node scripts/validate-extensions.mjs
node scripts/scan-extension-safety.mjs
```

## Workability

- Extensions are reviewed via CI safety gates before being registered.
- The registry is auto-generated from validated extension entries.
- One-click install/uninstall via WebUI Settings → Extensions.
