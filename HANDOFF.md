# Handoff

## State

- Fork of hermes-webui/hermes-webui-extensions.
- Registry, CI safety gates, and install/uninstall UI are live.
- Upstream maintains the master branch; this fork tracks `origin/main`.

## Next Actions

- [ ] Sync with upstream regularly
- [ ] Review extension safety scan output
- [ ] Add new extensions from community contributions

## Verify Before Ship

- [ ] `node scripts/validate-extensions.mjs` passes
- [ ] `node scripts/scan-extension-safety.mjs` passes
