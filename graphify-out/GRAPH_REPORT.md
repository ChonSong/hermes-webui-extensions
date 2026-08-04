# Graph Report - hermes-webui-extensions  (2026-08-04)

## Corpus Check
- 89 files · ~280,063 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 822 nodes · 1523 edges · 66 communities (45 shown, 21 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `58f3183e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- extension-registry-lib.mjs
- companion-adapter.js
- sidecar-contract-lib.mjs
- avatars.js
- feeds.js
- mobile-conversations.js
- message-pins.js
- theme-creator.js
- tiling.js
- handle_get
- custom-branding.js
- fetch_feed
- avatars.py
- get_settings
- Sidecar
- avatar.js
- Sidecar
- esc
- Sidecar
- session-export-pdf.js
- mcp-tool-shortcuts.js
- external-app-tab.js
- feeds.py
- custom-avatar.js
- model-favorites.js
- renderReadEntries
- _open
- _Capture
- _safe_fetch
- refreshSidebar
- test-chat-tiling.mjs
- validate-desktop-companion.mjs
- _agencyLogoHtml
- renderAllEntries
- mobile-haptics.js
- _fetch_article_text
- handle_get
- fetch_feed
- avatars.py
- get_settings
- tiling.js
- docker-tunnel-manager.js
- Chat Tiling
- test-chat-tiling.mjs
- Docker & Tunnel Manager
- loopback-sidecar/manifest.json
- manifest-bundle/manifest.json
- assistant-avatar/manifest.json
- smoke-chat-tiling-browser.mjs
- custom-avatar/manifest.json
- custom-branding/manifest.json
- desktop-companion/manifest.json
- e-ink-skin/manifest.json
- external-app-tab/manifest.json
- mcp-tool-shortcuts/manifest.json
- message-pins/manifest.json
- mobile-conversations/manifest.json
- mobile-haptics/manifest.json
- model-favorites/manifest.json
- chat-tiling/manifest.json
- docker-tunnel-manager/manifest.json
- session-export-pdf/manifest.json
- skin-pack/manifest.json
- theme-creator/manifest.json

## God Nodes (most connected - your core abstractions)
1. `buildAttention()` - 19 edges
2. `openMenu()` - 17 edges
3. `validateEntry()` - 17 edges
4. `cleanText()` - 15 edges
5. `sessionId()` - 14 edges
6. `Theme Creator` - 14 edges
7. `MCP Tool Shortcuts` - 13 edges
8. `Mobile Haptics` - 13 edges
9. `Skin Pack` - 13 edges
10. `install()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `validationErrors()` --calls--> `validateEntry()`  [EXTRACTED]
  scripts/test-extension-validator.mjs → scripts/extension-registry-lib.mjs
- `scanArtifacts()` --calls--> `buildRegistryWithArtifacts()`  [EXTRACTED]
  scripts/scan-extension-safety.mjs → scripts/extension-registry-lib.mjs
- `scanEntry()` --calls--> `repoRelative()`  [EXTRACTED]
  scripts/scan-extension-safety.mjs → scripts/extension-registry-lib.mjs
- `scanJavaScriptFile()` --calls--> `repoRelative()`  [EXTRACTED]
  scripts/scan-extension-safety.mjs → scripts/extension-registry-lib.mjs
- `scanTextFile()` --calls--> `repoRelative()`  [EXTRACTED]
  scripts/scan-extension-safety.mjs → scripts/extension-registry-lib.mjs

## Import Cycles
- None detected.

## Communities (66 total, 21 thin omitted)

### Community 0 - "extension-registry-lib.mjs"
Cohesion: 0.13
Nodes (26): artifactDownloadUrl(), artifactName(), assertValidResults(), buildExtensionArtifact(), buildRegistry(), buildRegistryFromResults(), buildRegistryWithArtifacts(), buildZip() (+18 more)

### Community 1 - "companion-adapter.js"
Cohesion: 0.08
Nodes (67): ackPetAction(), ackPetNavigation(), actionContinuationBaseline(), actionContinuationItem(), actionRequiredChoices(), actionRequiredMetadata(), actionRequiredType(), activeSessionId() (+59 more)

### Community 2 - "sidecar-contract-lib.mjs"
Cohesion: 0.05
Nodes (36): Contributing, Contribution Rules, Pull Request Checklist, Review Expectations, Best practices (enforced in review + by the safety scan), Capabilities And Best Practices, Compatibility Notes, Extension Entry Contract (+28 more)

### Community 3 - "avatars.js"
Cohesion: 0.40
Nodes (4): discoverEntries(), validateAllEntries(), failures, { results }

### Community 4 - "feeds.js"
Cohesion: 0.13
Nodes (14): Capabilities, Code / chat surface coverage, Compatibility, Controls, Current Shape, Dependency, Disable And Uninstall, How it stays usable (and safe) (+6 more)

### Community 5 - "mobile-conversations.js"
Cohesion: 0.15
Nodes (35): actionButton(), appendSvgNode(), buttonHomeBefore(), buttonHomeShell(), buttonSvg(), clearClickIgnore(), clearPressTimer(), closeDrawer() (+27 more)

### Community 6 - "message-pins.js"
Cohesion: 0.17
Nodes (31): closePopover(), currentSessionId(), decorateRow(), ensureHeaderButton(), escClose(), findRow(), install(), isPinned() (+23 more)

### Community 7 - "theme-creator.js"
Cohesion: 0.20
Nodes (30): applySkin(), bindSlider(), cancelPreview(), closePanel(), codeTokensFor(), compressImage(), currentBaseFromInputs(), defaultBase() (+22 more)

### Community 8 - "tiling.js"
Cohesion: 0.14
Nodes (13): Capabilities, Compatibility, Controls, Credit, Current Shape, Custom Branding, Disable And Uninstall, Install For Local Testing (+5 more)

### Community 9 - "handle_get"
Cohesion: 0.14
Nodes (13): Capabilities, Compatibility, Controls, Credit, Current Shape, Disable And Uninstall, Install For Local Testing, Known Limitations (+5 more)

### Community 10 - "custom-branding.js"
Cohesion: 0.20
Nodes (25): applyAll(), applyFavicon(), applyLogos(), applyLogoToContainer(), buildPickerBody(), closePicker(), coreFaviconLinks(), downscaleToDataUrl() (+17 more)

### Community 11 - "fetch_feed"
Cohesion: 0.14
Nodes (13): Capabilities, Compatibility, Controls, Current Shape, Disable And Uninstall, How it detects "turn complete", Install For Local Testing, Known Limitations (+5 more)

### Community 12 - "avatars.py"
Cohesion: 0.14
Nodes (13): Capabilities, Code / chat surface coverage, Compatibility, Current Shape, Dependency, Disable And Uninstall, Install For Local Testing, Known Limitations (+5 more)

### Community 13 - "get_settings"
Cohesion: 0.15
Nodes (12): Capabilities, Compatibility, Controls, Current Shape, Custom Assistant Avatar, Disable And Uninstall, Install For Local Testing, Known Limitations (+4 more)

### Community 14 - "Sidecar"
Cohesion: 0.15
Nodes (12): Capabilities, Code / chat surface coverage, Compatibility, Current Shape, Dependency, Disable And Uninstall, E-Ink Skin, Install For Local Testing (+4 more)

### Community 15 - "avatar.js"
Cohesion: 0.25
Nodes (21): animate(), applyPosition(), buildPathCache(), buildSettingsContent(), closeSettings(), detectState(), ensureTitlebarButton(), install() (+13 more)

### Community 16 - "Sidecar"
Cohesion: 0.15
Nodes (12): Capabilities, Compatibility, Controls, ⚠️ CSP dependency (read this), Current Shape, Disable And Uninstall, External App Tab, Install For Local Testing (+4 more)

### Community 17 - "esc"
Cohesion: 0.15
Nodes (12): Capabilities, Compatibility, Controls, Credit, Current Shape, Disable And Uninstall, Install For Local Testing, Known Limitations (+4 more)

### Community 18 - "Sidecar"
Cohesion: 0.17
Nodes (11): Fields the **Action adds** to the published registry entry (authors don't write these), Install metadata / lifecycle the schema must support (per @santastabber), Manifest derivation must preserve core hardening (per @santastabber), Not in scope for this RFC, Open questions (please weigh in), Proposed: author writes `extension.json`, the Action derives the loader manifest, Proposed schema, Resolved (maintainer consensus) (+3 more)

### Community 19 - "session-export-pdf.js"
Cohesion: 0.24
Nodes (20): closeMenu(), collectRows(), currentTitle(), ensureButton(), esc(), escapeHtml(), exportMarkdown(), exportPdf() (+12 more)

### Community 20 - "mcp-tool-shortcuts.js"
Cohesion: 0.26
Nodes (18): decorateRows(), draftPrompt(), escapeHtml(), fetchTools(), install(), isPinned(), loadPins(), mcpToolsSection() (+10 more)

### Community 21 - "external-app-tab.js"
Cohesion: 0.30
Nodes (17): buildOverlay(), closeOverlay(), ensureRailButton(), escapeHtml(), escClose(), extSettings(), install(), legacyLoadCfg() (+9 more)

### Community 22 - "feeds.py"
Cohesion: 0.17
Nodes (11): Capabilities, Compatibility, Current Shape, Desktop Companion, Disable And Uninstall, Install For Local Testing, Install From Gallery, Known Limitations (+3 more)

### Community 23 - "custom-avatar.js"
Cohesion: 0.29
Nodes (16): applyAll(), applyToIcon(), closePicker(), downscaleToDataUrl(), esc(), getAvatar(), install(), isDataImage() (+8 more)

### Community 24 - "model-favorites.js"
Cohesion: 0.30
Nodes (16): apply(), buildFavGroup(), decorateRows(), escapeHtml(), favKey(), install(), isFav(), loadFavs() (+8 more)

### Community 25 - "renderReadEntries"
Cohesion: 0.17
Nodes (11): Capabilities, Compatibility, Credit, Current Shape, Disable And Uninstall, Install For Local Testing, Known Limitations, Message Pins (+3 more)

### Community 26 - "_open"
Cohesion: 0.18
Nodes (10): Architecture, Assistant Avatar — Cute companion character, Behavior, Characters, Files, Install (already done), Mouse Tracking, Public API (+2 more)

### Community 27 - "_Capture"
Cohesion: 0.18
Nodes (10): Capabilities, Compatibility, Current Shape, Disable And Uninstall, Install For Local Testing, Known Limitations, Mobile Conversations Button, Trust And Permissions (+2 more)

### Community 28 - "_safe_fetch"
Cohesion: 0.18
Nodes (10): Capabilities, Compatibility, Current Shape, Disable And Uninstall, Install For Local Testing, Known Limitations, Model Favorites, Trust And Permissions (+2 more)

### Community 29 - "refreshSidebar"
Cohesion: 0.21
Nodes (27): api(), assignSession(), buildPanel(), fetchData(), fetchLastUserMessages(), fuzzyMatch(), getProjectName(), getSetting() (+19 more)

### Community 31 - "validate-desktop-companion.mjs"
Cohesion: 0.20
Nodes (6): adapter, adapterPath, check, entry, manifest, root

### Community 33 - "renderAllEntries"
Cohesion: 0.18
Nodes (21): assertArray(), assertBoolean(), assertString(), isHttpUrl(), isLowerHyphenId(), isNonEmptyString(), isPlainObject(), isSafeLocalPath() (+13 more)

### Community 34 - "mobile-haptics.js"
Cohesion: 0.53
Nodes (8): enabled(), extSettings(), hapticsSupported(), install(), onStateMaybeChanged(), sendBtnAction(), setEnabled(), startObserver()

### Community 35 - "_fetch_article_text"
Cohesion: 0.21
Nodes (16): repoRelative(), collectEntryFiles(), disclosesIframeClipboard(), { discovered, results }, errors, grantsIframeClipboard(), isAllowedNetworkLiteral(), isSafeRelativePath() (+8 more)

### Community 36 - "handle_get"
Cohesion: 0.17
Nodes (11): Compatibility And Verification, Disable / Uninstall, Features, Files, Installation, Known Limitations, Project Allocator Extension, Trust Model And Permissions (+3 more)

### Community 37 - "fetch_feed"
Cohesion: 0.43
Nodes (6): mergeDeep(), scriptsDir, tmpRoot, validationErrors(), writeIframeClipboardCase(), writeJson()

### Community 38 - "avatars.py"
Cohesion: 0.33
Nodes (4): artifactsDir, outDir, outPath, { registry, artifacts }

### Community 40 - "tiling.js"
Cohesion: 0.20
Nodes (29): applyBadges(), badge(), chatPanelActive(), closeAll(), closeTile(), createTile(), createToolbar(), focusTile() (+21 more)

### Community 41 - "docker-tunnel-manager.js"
Cohesion: 0.15
Nodes (19): _attr(), _autoRefreshMs(), _clear(), _closeOverlay(), _ensureTitlebarButton(), _getKey(), install(), _invalidatePolls() (+11 more)

### Community 42 - "Chat Tiling"
Cohesion: 0.20
Nodes (9): Architecture, Capabilities, Chat Tiling, How It Works, Install For Local Testing, Keyboard Shortcuts, Requirements, Settings (+1 more)

### Community 43 - "test-chat-tiling.mjs"
Cohesion: 0.36
Nodes (9): assert(), createFreshDom(), __dirname, main(), repoRoot, section(), setSession(), settle() (+1 more)

### Community 44 - "Docker & Tunnel Manager"
Cohesion: 0.25
Nodes (7): Docker & Tunnel Manager, Installation, Permissions, Pinned dependency, Security model, Status, Tabs

### Community 48 - "smoke-chat-tiling-browser.mjs"
Cohesion: 0.38
Nodes (6): assert(), __dirname, extPath, fetchCoreHtml(), main(), repoRoot

## Knowledge Gaps
- **265 isolated node(s):** `extensions`, `extensions`, `extensions`, `extensions`, `extensions` (+260 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 10 inferred relationships involving `openMenu()` (e.g. with `install()` and `goLast()`) actually correct?**
  _`openMenu()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `extensions`, `extensions`, `extensions` to the rest of the system?**
  _265 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `extension-registry-lib.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.13105413105413105 - nodes in this community are weakly interconnected._
- **Should `companion-adapter.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08340649692712906 - nodes in this community are weakly interconnected._
- **Should `sidecar-contract-lib.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._
- **Should `feeds.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `mobile-conversations.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1492063492063492 - nodes in this community are weakly interconnected._