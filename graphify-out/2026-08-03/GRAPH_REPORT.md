# Graph Report - hermes-webui-extensions  (2026-08-03)

## Corpus Check
- 114 files · ~342,475 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1260 nodes · 2349 edges · 94 communities (69 shown, 25 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0312a02f`
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
- Sidecar
- Sidecar
- esc
- Sidecar
- feeds.py
- loopback-sidecar/manifest.json
- manifest-bundle/manifest.json
- assistant-avatar/manifest.json
- renderReadEntries
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
- _open
- _Capture
- session-export-pdf/manifest.json
- skin-pack/manifest.json
- theme-creator/manifest.json
- RSS Feeds
- _safe_fetch
- refreshSidebar
- Profile Avatars
- Sidecar contract (proxy → sidecar authentication)
- Chat Tiling
- _agencyLogoHtml
- renderAllEntries
- test-chat-tiling.mjs
- _fetch_article_text
- Hermes WebUI Extensions
- SidecarScaffoldTests
- Vision & Roadmap — Hermes WebUI Extensions
- feeds-inject.js
- Contributing
- _resolve_pinned
- package.json
- extension-entry.md
- Capabilities And Best Practices
- test_job_ownership.py
- Manifest and runtime ownership
- sidecar-scaffold/routes_impl.py
- profile-avatars/sidecar/routes_impl.py
- _NoRedirect
- test-message-pins-sync.mjs
- chat-tiling/manifest.json
- profile-avatars/manifest.json
- rss-feeds/manifest.json

## God Nodes (most connected - your core abstractions)
1. `esc()` - 29 edges
2. `_open()` - 23 edges
3. `buildAttention()` - 19 edges
4. `validateEntry()` - 19 edges
5. `openMenu()` - 17 edges
6. `checkScaffoldSync()` - 17 edges
7. `checkSidecarUsage()` - 16 edges
8. `cleanText()` - 15 edges
9. `renderReadEntries()` - 15 edges
10. `renderSummariesView()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `renderPopover()` --indirect_call--> `remove()`  [INFERRED]
  extensions/message-pins/assets/message-pins.js → extensions/profile-avatars/assets/avatars.js
- `validateSidecar()` --calls--> `symlinksUnder()`  [EXTRACTED]
  scripts/extension-registry-lib.mjs → scripts/sidecar-contract-lib.mjs
- `validateEntry()` --calls--> `symlinksUnder()`  [EXTRACTED]
  scripts/extension-registry-lib.mjs → scripts/sidecar-contract-lib.mjs
- `scanArtifacts()` --calls--> `buildRegistryWithArtifacts()`  [EXTRACTED]
  scripts/scan-extension-safety.mjs → scripts/extension-registry-lib.mjs
- `_require_auth()` --calls--> `is_auth_enabled()`  [EXTRACTED]
  extensions/rss-feeds/sidecar/feeds.py → extensions/rss-feeds/sidecar/shim.py

## Import Cycles
- None detected.

## Communities (94 total, 25 thin omitted)

### Community 0 - "extension-registry-lib.mjs"
Cohesion: 0.05
Nodes (78): artifactDownloadUrl(), artifactName(), assertArray(), assertBoolean(), assertString(), buildExtensionArtifact(), buildRegistry(), buildRegistryFromResults() (+70 more)

### Community 1 - "companion-adapter.js"
Cohesion: 0.08
Nodes (67): ackPetAction(), ackPetNavigation(), actionContinuationBaseline(), actionContinuationItem(), actionRequiredChoices(), actionRequiredMetadata(), actionRequiredType(), activeSessionId() (+59 more)

### Community 2 - "sidecar-contract-lib.mjs"
Cohesion: 0.22
Nodes (9): Compatibility Notes, Extension Entry Contract, Manifest Shape, Post-Install Guidance, README Shape, Required Files, Sidecar And Native Host Notes, Sidecar Metadata (+1 more)

### Community 3 - "avatars.js"
Cohesion: 0.08
Nodes (40): REPO, result, assertValidResults(), REPO_ROOT, CANON_FILES, checkScaffoldSync(), checkSidecarUsage(), commandTokens() (+32 more)

### Community 4 - "feeds.js"
Cohesion: 0.13
Nodes (14): Capabilities, Code / chat surface coverage, Compatibility, Controls, Current Shape, Dependency, Disable And Uninstall, How it stays usable (and safe) (+6 more)

### Community 5 - "mobile-conversations.js"
Cohesion: 0.15
Nodes (35): actionButton(), appendSvgNode(), buttonHomeBefore(), buttonHomeShell(), buttonSvg(), clearClickIgnore(), clearPressTimer(), closeDrawer() (+27 more)

### Community 6 - "message-pins.js"
Cohesion: 0.16
Nodes (33): addCandidateRow(), closePopover(), currentSessionId(), decorateRow(), ensureHeaderButton(), escClose(), findRow(), install() (+25 more)

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
Nodes (11): Fields the **Action adds** to the published registry entry (authors don't write these), Implemented: author maintains both declarations and CI checks agreement, Implemented `extension.json` schema, Install metadata / lifecycle the schema must support (per @santastabber), Manifest consistency preserves core hardening (per @santastabber), Not in scope for this RFC, Open questions (please weigh in), Resolved (maintainer consensus) (+3 more)

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
Cohesion: 0.13
Nodes (36): _addLauncher(), _broadcast(), _buildManager(), _canonicalProfileName(), _clearAvatarStatus(), _closeManager(), _confirmAvatarRemoval(), _decorateSessionRows() (+28 more)

### Community 30 - "test-chat-tiling.mjs"
Cohesion: 0.25
Nodes (5): Loopback Sidecar Example, Files, Running, Sidecar scaffold (reference), Writing routes

### Community 31 - "validate-desktop-companion.mjs"
Cohesion: 0.17
Nodes (8): adapter, adapterPath, check, entry, exampleManifest, manifest, repoRoot, root

### Community 33 - "renderAllEntries"
Cohesion: 0.08
Nodes (22): done(), fail(), _failReason(), _feedsBody(), _fillSummModels(), fmtAgo(), _initFeedsScrollNav(), _loadSummStatus() (+14 more)

### Community 34 - "mobile-haptics.js"
Cohesion: 0.53
Nodes (8): enabled(), extSettings(), hapticsSupported(), install(), onStateMaybeChanged(), sendBtnAction(), setEnabled(), startObserver()

### Community 35 - "_fetch_article_text"
Cohesion: 0.23
Nodes (26): applyBadges(), badge(), closeAll(), closeTile(), createTile(), createToolbar(), focusTile(), hasStableApi() (+18 more)

### Community 36 - "handle_get"
Cohesion: 0.11
Nodes (26): add_status(), _cap_by_bytes(), _err(), handle_delete(), handle_get(), handle_patch(), handle_post(), _handle_summarize() (+18 more)

### Community 37 - "fetch_feed"
Cohesion: 0.11
Nodes (22): Any, dict, _atom_entry(), _child_text(), _date_struct(), fetch_feed(), _localname(), _parse_feed_bytes() (+14 more)

### Community 38 - "avatars.py"
Cohesion: 0.12
Nodes (21): avatar_url_for(), _cache_buster(), delete_avatar(), _ensure_db(), get_avatar_meta(), get_avatar_row(), list_avatars(), _open() (+13 more)

### Community 39 - "get_settings"
Cohesion: 0.12
Nodes (23): _ensure_auto_fetch_thread(), _gemini_key(), _gemini_summarize(), get_settings(), _local_summarize(), _normalize_summary_config(), _ollama_summarize(), _openrouter_key() (+15 more)

### Community 40 - "Sidecar"
Cohesion: 0.13
Nodes (8): _compile(), Path, Pattern, Turn '/api/items/{id}' into a regex + the param names., Resolve the token file the SAME way core does (§9.2). Explicit override     firs, Request, _resolve_token_path(), Sidecar

### Community 41 - "Sidecar"
Cohesion: 0.13
Nodes (8): _compile(), Path, Pattern, Turn '/api/items/{id}' into a regex + the param names., Resolve the token file the SAME way core does (§9.2). Explicit override     firs, Request, _resolve_token_path(), Sidecar

### Community 42 - "esc"
Cohesion: 0.16
Nodes (22): _actionsCluster(), _attr(), _closeModal(), _decorateSummarizedCards(), _entrySummaryBodyEl(), _entrySummaryExpander(), _entrySummaryToggle(), esc() (+14 more)

### Community 43 - "Sidecar"
Cohesion: 0.13
Nodes (8): _compile(), Path, Pattern, Turn '/api/items/{id}' into a regex + the param names., Resolve the token file the SAME way core does (§9.2). Explicit override     firs, Request, _resolve_token_path(), Sidecar

### Community 44 - "feeds.py"
Cohesion: 0.17
Nodes (17): _auto_fetch_loop(), delete_feed(), _prune_job_results(), Feeds — RSS/Atom subscription panel for the WebUI.  Token-free by default: fetch, Single-flight guard around the real refresh. Auto (daemon) and manual     (POST), Evict expired, then oldest, keeping the map bounded. Caller holds the lock., Reserve + start ONE background refresh job (idempotent while one runs).     Retu, Start ONE background model test (idempotent while one runs). Returns its id. (+9 more)

### Community 48 - "renderReadEntries"
Cohesion: 0.23
Nodes (16): _attachSwipe(), _categoryColorClass(), _pagerHtml(), _pageSizeSelect(), _pageSlice(), _renderGroupedEntries(), renderReadEntries(), renderSearchView() (+8 more)

### Community 60 - "_open"
Cohesion: 0.14
Nodes (15): create_feed(), delete_summary(), _ensure_db(), get_summary(), list_feeds(), list_summaries(), mark_read(), _maybe_seed() (+7 more)

### Community 61 - "_Capture"
Cohesion: 0.14
Nodes (6): _Capture, _dispatch(), _parsed(), Route implementations for the rss-feeds sidecar (token-v1 scaffold).  ``feeds.py, Mimics the subset of BaseHTTPRequestHandler that feeds.py + shim.j use,     capt, Rebuild a urlsplit-style object (path + raw query string) for feeds.py,     whic

### Community 66 - "RSS Feeds"
Cohesion: 0.13
Nodes (14): AI summary backends (optional), Capabilities, Current Shape, Filesystem access, Future CI checks, Install, disable, uninstall, Install For Local Testing, Manual verification (+6 more)

### Community 67 - "_safe_fetch"
Cohesion: 0.15
Nodes (11): _favicon_cached_path(), _fetch_favicon(), handle_favicon(), _http_get(), _PinnedHTTPConnection, _PinnedHTTPSConnection, SSRF-safe HTTP GET. Validates every hop resolves to a *global* address,     pins, Fetch raw bytes with a timeout, SSRF-safe IP pinning, and a size cap. (+3 more)

### Community 68 - "refreshSidebar"
Cohesion: 0.21
Nodes (13): _autoFetchStatusLine(), _feedTimerState(), _fmtCountdown(), _fmtMinutes(), _loadSummaryMeta(), _maybeObserveAutoRefresh(), refreshSidebar(), _renderSidebarToolbar() (+5 more)

### Community 69 - "Profile Avatars"
Cohesion: 0.18
Nodes (10): Current Shape, Future CI checks, Install, disable, uninstall, Manual verification, Profile Avatars, Sidecar (token-v1 scaffold), Supported WebUI version / API surface, Trust and permissions (+2 more)

### Community 70 - "Sidecar contract (proxy → sidecar authentication)"
Cohesion: 0.20
Nodes (10): Auth-off posture, Checklist for a new sidecar, Docker limitation, Enforcement rules (what the scaffold guarantees, and you must not weaken), Sidecar contract (proxy → sidecar authentication), The request/response envelope (do not fight it), The token, Threat model — be honest about scope (+2 more)

### Community 71 - "Chat Tiling"
Cohesion: 0.20
Nodes (9): Architecture, Capabilities, Chat Tiling, How It Works, Install For Local Testing, Keyboard Shortcuts, Requirements, Settings (+1 more)

### Community 72 - "_agencyLogoHtml"
Cohesion: 0.20
Nodes (10): _agencyColor(), _agencyInitials(), _agencyLogoHtml(), _categoryIcon(), _catGroups(), _domainOf(), _renderCatGroupedList(), _renderSidebarFeeds() (+2 more)

### Community 73 - "renderAllEntries"
Cohesion: 0.31
Nodes (10): fetchEntries(), _filterRead(), _isRead(), loadFeedsPanel(), _readSubtitleSuffix(), renderAllEntries(), renderCategoryView(), renderFeedView() (+2 more)

### Community 74 - "test-chat-tiling.mjs"
Cohesion: 0.36
Nodes (9): assert(), createFreshDom(), __dirname, main(), repoRoot, section(), setSession(), settle() (+1 more)

### Community 75 - "_fetch_article_text"
Cohesion: 0.25
Nodes (8): _build_summary_prompt(), _fetch_article_text(), _html_to_text(), Background: build the prompt (fetching full article text for single-     article, Strip HTML → readable article text (no LLM, free). Extracts paragraph/     headi, Best-effort local fetch of an article's readable text. Reuses the feed     SSRF, Build the LLM prompt. Single-article: fetch the FULL article text (local)     an, _summary_worker()

### Community 76 - "Hermes WebUI Extensions"
Cohesion: 0.25
Nodes (8): Compatibility And Testing, Current Entries, Hermes WebUI Extensions, Repository Layout, Status, Trust Model, What Belongs Here, What Does Not Belong Here

### Community 77 - "SidecarScaffoldTests"
Cohesion: 0.36
Nodes (3): _free_port(), _load_sidecar_base(), SidecarScaffoldTests

### Community 78 - "Vision & Roadmap — Hermes WebUI Extensions"
Cohesion: 0.25
Nodes (8): Capability ladder, Compatibility & testing, How you can help, The registry & install experience (target), The thesis, Trust model (non-negotiable), Two repos, clean split, Vision & Roadmap — Hermes WebUI Extensions

### Community 79 - "feeds-inject.js"
Cohesion: 0.57
Nodes (6): addLauncher(), buildOverlay(), closeOverlay(), init(), openOverlay(), sidecarStatus()

### Community 80 - "Contributing"
Cohesion: 0.33
Nodes (4): Contributing, Contribution Rules, Pull Request Checklist, Review Expectations

### Community 81 - "_resolve_pinned"
Cohesion: 0.33
Nodes (6): _assert_public_url(), Reject any address that isn't globally routable. ``is_global`` is False     for, Resolve ``host``, validate that EVERY resolved address is public, and     return, Validate a URL is http(s) and resolves only to public addresses (used at     fee, _resolve_pinned(), _validate_public_ip()

### Community 82 - "package.json"
Cohesion: 0.33
Nodes (5): jsdom, devDependencies, jsdom, private, type

### Community 84 - "Capabilities And Best Practices"
Cohesion: 0.40
Nodes (5): Best practices (enforced in review + by the safety scan), Capabilities And Best Practices, Skins — `registerHermesSkin` with a base `scheme`, TTS engines — `registerHermesTtsEngine`, User settings — `settings_schema` (preferred over ad-hoc localStorage panels)

### Community 85 - "test_job_ownership.py"
Cohesion: 0.60
Nodes (4): Regression: a background job's poll must return ITS OWN outcome even after a lat, test_refresh_poll_returns_own_failure_after_next_job_starts(), test_summary_test_poll_returns_own_result_after_next_job_starts(), _wait_until()

### Community 86 - "Manifest and runtime ownership"
Cohesion: 0.50
Nodes (4): Auth modes, External runtime, Manifest and runtime ownership, Repository-vendored runtime

## Knowledge Gaps
- **300 isolated node(s):** `extensions`, `extensions`, `extensions`, `extensions`, `extensions` (+295 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_openrouter_key()` connect `get_settings` to `feeds.py`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `_safe_link()` connect `fetch_feed` to `feeds.py`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `checkScaffoldSync()` connect `avatars.js` to `extension-registry-lib.mjs`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `openMenu()` (e.g. with `install()` and `goLast()`) actually correct?**
  _`openMenu()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `extensions`, `extensions`, `extensions` to the rest of the system?**
  _300 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `extension-registry-lib.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.05171907140758154 - nodes in this community are weakly interconnected._
- **Should `companion-adapter.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08340649692712906 - nodes in this community are weakly interconnected._