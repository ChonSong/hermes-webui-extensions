# Graph Report - .  (2026-07-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 970 nodes · 2072 edges · 66 communities (43 shown, 23 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df577a9a`
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
- SidecarScaffoldTests
- feeds-inject.js
- _resolve_pinned
- package.json
- test_job_ownership.py
- sidecar-scaffold/routes_impl.py
- profile-avatars/sidecar/routes_impl.py
- _NoRedirect
- test-message-pins-sync.mjs
- loopback-sidecar/manifest.json
- manifest-bundle/manifest.json
- assistant-avatar/manifest.json
- chat-tiling/manifest.json
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
- profile-avatars/manifest.json
- rss-feeds/manifest.json
- session-export-pdf/manifest.json
- skin-pack/manifest.json
- theme-creator/manifest.json

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
- `tbActive()` --indirect_call--> `active()`  [INFERRED]
  extensions/chat-tiling/assets/tiling.js → extensions/profile-avatars/assets/avatars.js
- `renderPopover()` --indirect_call--> `remove()`  [INFERRED]
  extensions/message-pins/assets/message-pins.js → extensions/profile-avatars/assets/avatars.js
- `validateSidecar()` --calls--> `symlinksUnder()`  [EXTRACTED]
  scripts/extension-registry-lib.mjs → scripts/sidecar-contract-lib.mjs
- `validateEntry()` --calls--> `symlinksUnder()`  [EXTRACTED]
  scripts/extension-registry-lib.mjs → scripts/sidecar-contract-lib.mjs
- `assertValidResults()` --calls--> `checkScaffoldSync()`  [EXTRACTED]
  scripts/extension-registry-lib.mjs → scripts/sidecar-contract-lib.mjs

## Import Cycles
- None detected.

## Communities (66 total, 23 thin omitted)

### Community 0 - "extension-registry-lib.mjs"
Cohesion: 0.05
Nodes (79): artifactDownloadUrl(), artifactName(), assertArray(), assertBoolean(), assertString(), assertValidResults(), buildExtensionArtifact(), buildRegistry() (+71 more)

### Community 1 - "companion-adapter.js"
Cohesion: 0.08
Nodes (67): ackPetAction(), ackPetNavigation(), actionContinuationBaseline(), actionContinuationItem(), actionRequiredChoices(), actionRequiredMetadata(), actionRequiredType(), activeSessionId() (+59 more)

### Community 2 - "sidecar-contract-lib.mjs"
Cohesion: 0.08
Nodes (39): REPO, result, REPO_ROOT, CANON_FILES, checkScaffoldSync(), checkSidecarUsage(), commandTokens(), declaredSidecarEntries() (+31 more)

### Community 3 - "avatars.js"
Cohesion: 0.13
Nodes (37): active(), _addLauncher(), _broadcast(), _buildManager(), _canonicalProfileName(), _clearAvatarStatus(), _closeManager(), _confirmAvatarRemoval() (+29 more)

### Community 4 - "feeds.js"
Cohesion: 0.08
Nodes (22): done(), fail(), _failReason(), _feedsBody(), _fillSummModels(), fmtAgo(), _initFeedsScrollNav(), _loadSummStatus() (+14 more)

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
Cohesion: 0.22
Nodes (26): applyBadges(), badge(), closeAll(), closeTile(), createTile(), createToolbar(), focusTile(), hasStableApi() (+18 more)

### Community 9 - "handle_get"
Cohesion: 0.11
Nodes (26): add_status(), _cap_by_bytes(), _err(), handle_delete(), handle_get(), handle_patch(), handle_post(), _handle_summarize() (+18 more)

### Community 10 - "custom-branding.js"
Cohesion: 0.20
Nodes (25): applyAll(), applyFavicon(), applyLogos(), applyLogoToContainer(), buildPickerBody(), closePicker(), coreFaviconLinks(), downscaleToDataUrl() (+17 more)

### Community 11 - "fetch_feed"
Cohesion: 0.11
Nodes (22): Any, dict, _atom_entry(), _child_text(), _date_struct(), fetch_feed(), _localname(), _parse_feed_bytes() (+14 more)

### Community 12 - "avatars.py"
Cohesion: 0.12
Nodes (21): avatar_url_for(), _cache_buster(), delete_avatar(), _ensure_db(), get_avatar_meta(), get_avatar_row(), list_avatars(), _open() (+13 more)

### Community 13 - "get_settings"
Cohesion: 0.12
Nodes (23): _ensure_auto_fetch_thread(), _gemini_key(), _gemini_summarize(), get_settings(), _local_summarize(), _normalize_summary_config(), _ollama_summarize(), _openrouter_key() (+15 more)

### Community 14 - "Sidecar"
Cohesion: 0.13
Nodes (8): _compile(), Path, Pattern, Turn '/api/items/{id}' into a regex + the param names., Resolve the token file the SAME way core does (§9.2). Explicit override     firs, Request, _resolve_token_path(), Sidecar

### Community 15 - "avatar.js"
Cohesion: 0.25
Nodes (21): animate(), applyPosition(), buildPathCache(), buildSettingsContent(), closeSettings(), detectState(), ensureTitlebarButton(), install() (+13 more)

### Community 16 - "Sidecar"
Cohesion: 0.13
Nodes (8): _compile(), Path, Pattern, Turn '/api/items/{id}' into a regex + the param names., Resolve the token file the SAME way core does (§9.2). Explicit override     firs, Request, _resolve_token_path(), Sidecar

### Community 17 - "esc"
Cohesion: 0.16
Nodes (22): _actionsCluster(), _attr(), _closeModal(), _decorateSummarizedCards(), _entrySummaryBodyEl(), _entrySummaryExpander(), _entrySummaryToggle(), esc() (+14 more)

### Community 18 - "Sidecar"
Cohesion: 0.13
Nodes (8): _compile(), Path, Pattern, Turn '/api/items/{id}' into a regex + the param names., Resolve the token file the SAME way core does (§9.2). Explicit override     firs, Request, _resolve_token_path(), Sidecar

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
Nodes (17): _auto_fetch_loop(), delete_feed(), _prune_job_results(), Feeds — RSS/Atom subscription panel for the WebUI.  Token-free by default: fetch, Single-flight guard around the real refresh. Auto (daemon) and manual     (POST), Evict expired, then oldest, keeping the map bounded. Caller holds the lock., Reserve + start ONE background refresh job (idempotent while one runs).     Retu, Start ONE background model test (idempotent while one runs). Returns its id. (+9 more)

### Community 23 - "custom-avatar.js"
Cohesion: 0.29
Nodes (16): applyAll(), applyToIcon(), closePicker(), downscaleToDataUrl(), esc(), getAvatar(), install(), isDataImage() (+8 more)

### Community 24 - "model-favorites.js"
Cohesion: 0.30
Nodes (16): apply(), buildFavGroup(), decorateRows(), escapeHtml(), favKey(), install(), isFav(), loadFavs() (+8 more)

### Community 25 - "renderReadEntries"
Cohesion: 0.23
Nodes (16): _attachSwipe(), _categoryColorClass(), _pagerHtml(), _pageSizeSelect(), _pageSlice(), _renderGroupedEntries(), renderReadEntries(), renderSearchView() (+8 more)

### Community 26 - "_open"
Cohesion: 0.14
Nodes (15): create_feed(), delete_summary(), _ensure_db(), get_summary(), list_feeds(), list_summaries(), mark_read(), _maybe_seed() (+7 more)

### Community 27 - "_Capture"
Cohesion: 0.14
Nodes (6): _Capture, _dispatch(), _parsed(), Route implementations for the rss-feeds sidecar (token-v1 scaffold).  ``feeds.py, Mimics the subset of BaseHTTPRequestHandler that feeds.py + shim.j use,     capt, Rebuild a urlsplit-style object (path + raw query string) for feeds.py,     whic

### Community 28 - "_safe_fetch"
Cohesion: 0.15
Nodes (11): _favicon_cached_path(), _fetch_favicon(), handle_favicon(), _http_get(), _PinnedHTTPConnection, _PinnedHTTPSConnection, SSRF-safe HTTP GET. Validates every hop resolves to a *global* address,     pins, Fetch raw bytes with a timeout, SSRF-safe IP pinning, and a size cap. (+3 more)

### Community 29 - "refreshSidebar"
Cohesion: 0.21
Nodes (13): _autoFetchStatusLine(), _feedTimerState(), _fmtCountdown(), _fmtMinutes(), _loadSummaryMeta(), _maybeObserveAutoRefresh(), refreshSidebar(), _renderSidebarToolbar() (+5 more)

### Community 30 - "test-chat-tiling.mjs"
Cohesion: 0.19
Nodes (12): assert(), clickLayout(), code, __dirname, dom, loadSessionResolvers, main(), mockExtSettings (+4 more)

### Community 31 - "validate-desktop-companion.mjs"
Cohesion: 0.17
Nodes (8): adapter, adapterPath, check, entry, exampleManifest, manifest, repoRoot, root

### Community 32 - "_agencyLogoHtml"
Cohesion: 0.20
Nodes (10): _agencyColor(), _agencyInitials(), _agencyLogoHtml(), _categoryIcon(), _catGroups(), _domainOf(), _renderCatGroupedList(), _renderSidebarFeeds() (+2 more)

### Community 33 - "renderAllEntries"
Cohesion: 0.31
Nodes (10): fetchEntries(), _filterRead(), _isRead(), loadFeedsPanel(), _readSubtitleSuffix(), renderAllEntries(), renderCategoryView(), renderFeedView() (+2 more)

### Community 34 - "mobile-haptics.js"
Cohesion: 0.53
Nodes (8): enabled(), extSettings(), hapticsSupported(), install(), onStateMaybeChanged(), sendBtnAction(), setEnabled(), startObserver()

### Community 35 - "_fetch_article_text"
Cohesion: 0.25
Nodes (8): _build_summary_prompt(), _fetch_article_text(), _html_to_text(), Background: build the prompt (fetching full article text for single-     article, Strip HTML → readable article text (no LLM, free). Extracts paragraph/     headi, Best-effort local fetch of an article's readable text. Reuses the feed     SSRF, Build the LLM prompt. Single-article: fetch the FULL article text (local)     an, _summary_worker()

### Community 36 - "SidecarScaffoldTests"
Cohesion: 0.36
Nodes (3): _free_port(), _load_sidecar_base(), SidecarScaffoldTests

### Community 37 - "feeds-inject.js"
Cohesion: 0.57
Nodes (6): addLauncher(), buildOverlay(), closeOverlay(), init(), openOverlay(), sidecarStatus()

### Community 38 - "_resolve_pinned"
Cohesion: 0.33
Nodes (6): _assert_public_url(), Reject any address that isn't globally routable. ``is_global`` is False     for, Resolve ``host``, validate that EVERY resolved address is public, and     return, Validate a URL is http(s) and resolves only to public addresses (used at     fee, _resolve_pinned(), _validate_public_ip()

### Community 39 - "package.json"
Cohesion: 0.33
Nodes (5): jsdom, devDependencies, jsdom, private, type

### Community 40 - "test_job_ownership.py"
Cohesion: 0.60
Nodes (4): Regression: a background job's poll must return ITS OWN outcome even after a lat, test_refresh_poll_returns_own_failure_after_next_job_starts(), test_summary_test_poll_returns_own_result_after_next_job_starts(), _wait_until()

## Knowledge Gaps
- **70 isolated node(s):** `extensions`, `extensions`, `extensions`, `extensions`, `extensions` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `remove()` connect `avatars.js` to `message-pins.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `renderPopover()` connect `message-pins.js` to `avatars.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `active()` connect `avatars.js` to `tiling.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `openMenu()` (e.g. with `install()` and `goLast()`) actually correct?**
  _`openMenu()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `extensions`, `extensions`, `extensions` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `extension-registry-lib.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.05163511187607573 - nodes in this community are weakly interconnected._
- **Should `companion-adapter.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08340649692712906 - nodes in this community are weakly interconnected._