(() => {
  'use strict';

  // ── External App Tab extension for Hermes WebUI ──────────────────────────
  // Embeds one or more compatible self-hosted web apps (Grafana, Vaultwarden,
  // personal dashboards) as iframed tabs inside the WebUI. Adds rail button(s)
  // that open a full-area overlay panel framing the selected app's URL.
  //
  // IMPORTANT — CSP dependency:
  //   The WebUI's Content-Security-Policy only allows framing same-origin
  //   content by default. To frame an EXTERNAL origin, the operator must allow
  //   it via the core knob (nesquena/hermes-webui PR #5091):
  //       export HERMES_WEBUI_CSP_FRAME_EXTRA="https://your-app.example.com"
  //   A same-origin or loopback-reverse-proxied URL works without any core
  //   change. If the configured URL is blocked by CSP, the browser refuses to
  //   load the frame; the extension shows a hint explaining the knob.
  //
  // Storage: raw localStorage key "hermes-ext-external-app" with JSON shape:
  //   { _v: 2, apps: [{ id, url, label, icon }] }
  // Legacy v1 format { url, label } auto-migrates on first load.
  // No backend, no network calls of its own (it only sets an <iframe src>,
  // which the browser loads under the page CSP).

  const EXT = 'external-app-tab';
  if (window.__hermesExternalAppTabLoaded) return;
  window.__hermesExternalAppTabLoaded = true;

  const CFG_KEY = 'hermes-ext-external-app';
  const RAIL_BTN_PREFIX = 'hwxExtAppRailBtn';
  const OVERLAY_ID = 'hwxExtAppOverlay';

  let overlayOpen = false;
  let selectedAppId = null;

  // ── Data model ──────────────────────────────────────────────────────────
  // v1 (legacy): { url, label }
  // v2 (current): { _v: 2, apps: [{ id, url, label, icon }] }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function loadCfg() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return { _v: 2, apps: [] };

      const parsed = JSON.parse(raw);

      // v2 — return as-is
      if (parsed && parsed._v === 2) {
        return { _v: 2, apps: Array.isArray(parsed.apps) ? parsed.apps : [] };
      }

      // Legacy v1 — migrate to v2
      if (parsed && typeof parsed.url === 'string') {
        const app = {
          id: uid(),
          url: parsed.url || '',
          label: (parsed.label && parsed.label !== 'App') ? parsed.label : 'App',
          icon: ''
        };
        const migrated = { _v: 2, apps: [app] };
        try { localStorage.setItem(CFG_KEY, JSON.stringify(migrated)); } catch (_) {}
        return migrated;
      }

      return { _v: 2, apps: [] };
    } catch (_) {
      return { _v: 2, apps: [] };
    }
  }

  function saveCfg(apps) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        _v: 2,
        apps: Array.isArray(apps) ? apps : []
      }));
    } catch (_) {}
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  function validUrl(s) {
    if (typeof s !== 'string' || !s) return false;
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function originOf(u) {
    try { return new URL(u).origin; } catch (_) { return u; }
  }

  // ── app lookup ──────────────────────────────────────────────────────────

  function getApp(id) {
    if (!id) return null;
    const cfg = loadCfg();
    return cfg.apps.find(a => a.id === id) || null;
  }

  function selectedApp() {
    return getApp(selectedAppId) || (loadCfg().apps[0] || null);
  }

  // ── rail buttons ────────────────────────────────────────────────────────
  // One button per configured app. If no apps exist, a single default "App"
  // button shows the empty-state overlay with a Configure CTA.

  function railIcon() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>' +
      '<path d="M15 21V9"/></svg>';
  }

  function createRailButton(app) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rail-btn nav-tab has-tooltip hwx-extapp-rail';
    const label = app ? app.label : 'App';
    btn.dataset.tooltip = label;
    btn.setAttribute('aria-label', label);
    btn.id = app ? RAIL_BTN_PREFIX + '-' + app.id : RAIL_BTN_PREFIX;
    btn.dataset.appId = app ? app.id : '';
    btn.dataset.hwxExtapp = '1';                       /* marker for our own buttons */
    btn.innerHTML = railIcon();
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const targetId = app ? app.id : null;
      // Rail button always navigates to the target app.  If the overlay is
      // already open for a *different* app, switch content without closing.
      if (overlayOpen) {
        if (selectedAppId === targetId) { closeOverlay(); return; }
        selectedAppId = targetId;
        renderOverlayContent();
        // Update active button
        document.querySelectorAll('[data-hwx-extapp="1"]').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(targetId ? RAIL_BTN_PREFIX + '-' + targetId : RAIL_BTN_PREFIX);
        if (activeBtn) activeBtn.classList.add('active');
        return;
      }
      selectedAppId = targetId;
      openOverlay();
    });
    return btn;
  }

  function syncRailButtons() {
    const rail = document.querySelector('.rail');
    if (!rail) return 0;

    const cfg = loadCfg();
    const existing = rail.querySelectorAll('[data-hwx-extapp="1"]');
    const validIds = new Set();

    // Add/update one button per app
    cfg.apps.forEach((app) => {
      validIds.add(app.id);
      const btnId = RAIL_BTN_PREFIX + '-' + app.id;
      let btn = document.getElementById(btnId);
      if (!btn) {
        btn = createRailButton(app);
        btn.id = btnId;
        btn.dataset.appId = app.id;
        const spacer = rail.querySelector('.rail-spacer');
        if (spacer) rail.insertBefore(btn, spacer);
        else rail.appendChild(btn);
      }
      btn.dataset.tooltip = app.label;
      btn.setAttribute('aria-label', app.label);
    });

    // Remove stale buttons (apps that no longer exist)
    existing.forEach((btn) => {
      const appId = btn.dataset.appId;
      if (appId && !validIds.has(appId)) {
        btn.remove();
      }
    });

    // If no apps, ensure the default "App" button exists
    if (cfg.apps.length === 0) {
      let defaultBtn = document.getElementById(RAIL_BTN_PREFIX);
      if (!defaultBtn) {
        defaultBtn = createRailButton(null);
        const spacer = rail.querySelector('.rail-spacer');
        if (spacer) rail.insertBefore(defaultBtn, spacer);
        else rail.appendChild(defaultBtn);
      }
    } else {
      // Remove default button if present
      const defaultBtn = document.getElementById(RAIL_BTN_PREFIX);
      if (defaultBtn) defaultBtn.remove();
    }

    return cfg.apps.length;
  }

  // ── overlay panel with the iframe ───────────────────────────────────────

  function buildOverlay() {
    let ov = document.getElementById(OVERLAY_ID);
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.className = 'hwx-extapp-overlay';
    ov.style.display = 'none';
    ov.innerHTML =
      '<div class="hwx-extapp-bar">' +
        '<span class="hwx-extapp-title"></span>' +
        '<span class="hwx-extapp-spacer"></span>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-add" title="Add app" aria-label="Add app">+</button>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-config" title="Configure">Configure</button>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-open" title="Open in new tab">Open ↗</button>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-close" title="Close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="hwx-extapp-body"></div>';
    document.body.appendChild(ov);
    ov.querySelector('.hwx-extapp-close').addEventListener('click', () => closeOverlay());
    ov.querySelector('.hwx-extapp-config').addEventListener('click', () => openConfig());
    ov.querySelector('.hwx-extapp-add').addEventListener('click', () => openConfig(true));
    ov.querySelector('.hwx-extapp-open').addEventListener('click', () => {
      const app = selectedApp();
      if (app && validUrl(app.url)) window.open(app.url, '_blank', 'noopener');
    });
    return ov;
  }

  function renderOverlayContent() {
    const ov = buildOverlay();
    const app = selectedApp();
    const label = app ? app.label : 'External app';
    ov.querySelector('.hwx-extapp-title').textContent = label;
    const body = ov.querySelector('.hwx-extapp-body');
    body.innerHTML = '';
    if (!app || !validUrl(app.url)) {
      const empty = document.createElement('div');
      empty.className = 'hwx-extapp-empty';
      empty.innerHTML =
        '<p>No app configured yet.</p>' +
        '<p class="hwx-extapp-muted">Set a URL to embed a compatible self-hosted web app as a tab.</p>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-config-cta">Configure…</button>';
      empty.querySelector('.hwx-extapp-config-cta').addEventListener('click', () => openConfig());
      body.appendChild(empty);
      return;
    }
    const frame = document.createElement('iframe');
    frame.className = 'hwx-extapp-iframe';
    frame.src = app.url;
    frame.setAttribute('title', label);
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    const hint = document.createElement('div');
    hint.className = 'hwx-extapp-cspnote';
    hint.innerHTML = 'If this stays blank, the page may be blocked by the WebUI ' +
      'Content-Security-Policy. Allow it (operator) with ' +
      '<code>HERMES_WEBUI_CSP_FRAME_EXTRA="' + escapeHtml(originOf(app.url)) + '"</code>.';
    body.appendChild(frame);
    body.appendChild(hint);
  }

  function toggleOverlay() { overlayOpen ? closeOverlay() : openOverlay(); }

  function openOverlay(appId) {
    if (appId) selectedAppId = appId;
    renderOverlayContent();
    const ov = document.getElementById(OVERLAY_ID);
    if (!ov) return;
    ov.style.display = 'flex';
    overlayOpen = true;
    // Active state on matching rail button
    const app = selectedApp();
    document.querySelectorAll('[data-hwx-extapp="1"]').forEach(b => b.classList.remove('active'));
    if (app) {
      const activeBtn = document.getElementById(RAIL_BTN_PREFIX + '-' + app.id) || document.getElementById(RAIL_BTN_PREFIX);
      if (activeBtn) activeBtn.classList.add('active');
    }
    document.addEventListener('keydown', escClose, true);
  }

  function closeOverlay() {
    const ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.style.display = 'none';
    overlayOpen = false;
    document.querySelectorAll('[data-hwx-extapp="1"]').forEach(b => b.classList.remove('active'));
    document.removeEventListener('keydown', escClose, true);
  }

  function escClose(ev) { if (ev.key === 'Escape') closeOverlay(); }

  // ── config dialog ───────────────────────────────────────────────────────

  function openConfig(addNew) {
    const app = addNew ? null : selectedApp();
    let dlg = document.getElementById('hwxExtAppConfig');
    if (dlg) dlg.remove();
    dlg = document.createElement('div');
    dlg.id = 'hwxExtAppConfig';
    dlg.className = 'hwx-extapp-config-dlg';
    dlg.innerHTML =
      '<div class="hwx-extapp-config-card" role="dialog" aria-label="Configure external app">' +
        '<div class="hwx-extapp-config-title">' + (app ? 'Edit app' : 'Add app') + '</div>' +
        '<label class="hwx-extapp-field"><span>Label</span>' +
          '<input type="text" class="hwx-extapp-input hwx-extapp-label-in" maxlength="24" placeholder="App"></label>' +
        '<label class="hwx-extapp-field"><span>URL (http/https)</span>' +
          '<input type="url" class="hwx-extapp-input hwx-extapp-url-in" placeholder="https://app.example.com"></label>' +
        '<div class="hwx-extapp-config-note">To frame an external origin, the operator must allow it via ' +
          '<code>HERMES_WEBUI_CSP_FRAME_EXTRA</code>. Same-origin / loopback URLs work without it.</div>' +
        '<div class="hwx-extapp-config-err" hidden></div>' +
        '<div class="hwx-extapp-config-actions">' +
          '<button type="button" class="hwx-extapp-btn hwx-extapp-delete" style="margin-right:auto;color:var(--danger,#e5534b)">Delete</button>' +
          '<button type="button" class="hwx-extapp-btn hwx-extapp-cancel">Cancel</button>' +
          '<button type="button" class="hwx-extapp-btn hwx-extapp-save">Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    const labelIn = dlg.querySelector('.hwx-extapp-label-in');
    const urlIn = dlg.querySelector('.hwx-extapp-url-in');
    const err = dlg.querySelector('.hwx-extapp-config-err');
    const deleteBtn = dlg.querySelector('.hwx-extapp-delete');
    labelIn.value = app ? app.label : '';
    urlIn.value = app ? app.url : '';
    // Hide delete button if we're adding (no existing app)
    if (!app) deleteBtn.style.display = 'none';

    const close = () => dlg.remove();
    dlg.querySelector('.hwx-extapp-cancel').addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });

    // Delete button — remove this app and refresh
    deleteBtn.addEventListener('click', () => {
      if (!app) return close();
      const cfg = loadCfg();
      cfg.apps = cfg.apps.filter(a => a.id !== app.id);
      saveCfg(cfg.apps);
      selectedAppId = null;
      syncRailButtons();
      close();
      closeOverlay();
    });

    // Save button
    dlg.querySelector('.hwx-extapp-save').addEventListener('click', () => {
      const url = urlIn.value.trim();
      const label = (labelIn.value.trim() || 'App').slice(0, 24);
      if (url && !validUrl(url)) {
        err.hidden = false;
        err.textContent = 'Enter a valid http(s) URL (or leave blank to clear).';
        return;
      }

      const cfg = loadCfg();
      if (app && cfg.apps.some(a => a.id === app.id)) {
        // Edit existing app
        cfg.apps = cfg.apps.map(a => a.id === app.id ? { ...a, url, label } : a);
        selectedAppId = app.id;
      } else {
        // Add new app
        const newApp = { id: uid(), url, label, icon: '' };
        cfg.apps.push(newApp);
        selectedAppId = newApp.id;
      }
      saveCfg(cfg.apps);

      // Refresh rail buttons and overlay
      syncRailButtons();
      if (overlayOpen) renderOverlayContent();
      close();
    });
  }

  // ── install ─────────────────────────────────────────────────────────────

  function install(attempt) {
    attempt = attempt || 0;
    if (document.querySelector('.rail')) {
      syncRailButtons();
      window.HermesExternalAppTabExtension = {
        version: '0.3.0',
        getConfig: loadCfg,
        setConfig(url, label) {
          if (url && !validUrl(url)) return false;
          const cfg = loadCfg();
          const app = selectedAppId ? getApp(selectedAppId) : cfg.apps[0] || null;
          if (app) {
            app.url = url || '';
            app.label = (label || 'App').slice(0, 24);
          } else {
            const newApp = { id: uid(), url: url || '', label: (label || 'App').slice(0, 24), icon: '' };
            cfg.apps.push(newApp);
            selectedAppId = newApp.id;
          }
          saveCfg(cfg.apps);
          syncRailButtons();
          if (overlayOpen) renderOverlayContent();
          return true;
        },
        open(id) {
          if (id) {
            selectedAppId = id;
          } else {
            const cfg = loadCfg();
            selectedAppId = cfg.apps.length > 0 ? cfg.apps[0].id : null;
          }
          openOverlay();
        },
        close: closeOverlay,
      };
      return true;
    }
    if (attempt < 80) { setTimeout(() => install(attempt + 1), 150); return false; }
    console.warn('[' + EXT + '] rail not found; not installed');
    return false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => install(), { once: true });
  } else {
    install();
  }
})();
