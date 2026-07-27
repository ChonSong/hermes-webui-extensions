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
  const RAIL_BTN_ID = 'hwxExtAppRailBtn';
  const OVERLAY_ID = 'hwxExtAppOverlay';

  let overlayOpen = false;

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
      .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function originOf(u) {
    try { return new URL(u).origin; } catch (_) { return u; }
  }

  function currentApp() {
    const cfg = loadCfg();
    return cfg.apps && cfg.apps.length > 0 ? cfg.apps[0] : null;
  }

  // ── rail button ─────────────────────────────────────────────────────────

  function railIcon() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>' +
      '<path d="M15 21V9"/></svg>';
  }

  function ensureRailButton() {
    if (document.getElementById(RAIL_BTN_ID)) return document.getElementById(RAIL_BTN_ID);
    const rail = document.querySelector('.rail');
    if (!rail) return null;
    const btn = document.createElement('button');
    btn.id = RAIL_BTN_ID;
    btn.type = 'button';
    btn.className = 'rail-btn nav-tab has-tooltip hwx-extapp-rail';
    const app = currentApp();
    const label = app ? app.label : 'App';
    btn.dataset.tooltip = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = railIcon();
    btn.addEventListener('click', (ev) => { ev.preventDefault(); toggleOverlay(); });
    // Insert just before the rail spacer (so it sits with the content tabs,
    // above settings), or append if there's no spacer.
    const spacer = rail.querySelector('.rail-spacer');
    if (spacer) rail.insertBefore(btn, spacer);
    else rail.appendChild(btn);
    return btn;
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
        '<button type="button" class="hwx-extapp-btn hwx-extapp-config" title="Configure">Configure</button>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-open" title="Open in new tab">Open ↗</button>' +
        '<button type="button" class="hwx-extapp-btn hwx-extapp-close" title="Close" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="hwx-extapp-body"></div>';
    document.body.appendChild(ov);
    ov.querySelector('.hwx-extapp-close').addEventListener('click', () => closeOverlay());
    ov.querySelector('.hwx-extapp-config').addEventListener('click', () => openConfig());
    ov.querySelector('.hwx-extapp-open').addEventListener('click', () => {
      const app = currentApp();
      if (app && validUrl(app.url)) window.open(app.url, '_blank', 'noopener');
    });
    return ov;
  }

  function renderOverlayContent() {
    const ov = buildOverlay();
    const app = currentApp();
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
    // Sandbox the embedded app with an explicit, documented allow-list so it can
    // function (scripts/forms/popups) while staying constrained (Frank, PR #25:
    // the previous comment claimed "sandboxed" but never set a sandbox attr).
    // Tradeoff: a real web app generally needs allow-scripts + allow-same-origin
    // to work; for a SAME-ORIGIN target that pairing relaxes the origin barrier,
    // so the README is explicit that an embedded app is trusted browser content
    // once the operator allow-lists its origin via HERMES_WEBUI_CSP_FRAME_EXTRA.
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    // A CSP frame-src block surfaces as a blank frame; show a hint underneath
    // that the operator may need HERMES_WEBUI_CSP_FRAME_EXTRA.
    const hint = document.createElement('div');
    hint.className = 'hwx-extapp-cspnote';
    hint.innerHTML = 'If this stays blank, the page may be blocked by the WebUI ' +
      'Content-Security-Policy. Allow it (operator) with ' +
      '<code>HERMES_WEBUI_CSP_FRAME_EXTRA="' + escapeHtml(originOf(app.url)) + '"</code>.';
    body.appendChild(frame);
    body.appendChild(hint);
  }

  function toggleOverlay() { overlayOpen ? closeOverlay() : openOverlay(); }

  function openOverlay() {
    renderOverlayContent();
    const ov = document.getElementById(OVERLAY_ID);
    ov.style.display = 'flex';
    overlayOpen = true;
    const btn = document.getElementById(RAIL_BTN_ID);
    if (btn) btn.classList.add('active');
    document.addEventListener('keydown', escClose, true);
  }
  function closeOverlay() {
    const ov = document.getElementById(OVERLAY_ID);
    if (ov) ov.style.display = 'none';
    overlayOpen = false;
    const btn = document.getElementById(RAIL_BTN_ID);
    if (btn) btn.classList.remove('active');
    document.removeEventListener('keydown', escClose, true);
  }
  function escClose(ev) { if (ev.key === 'Escape') closeOverlay(); }

  // ── config dialog ───────────────────────────────────────────────────────

  function openConfig() {
    const app = currentApp();
    let dlg = document.getElementById('hwxExtAppConfig');
    if (dlg) dlg.remove();
    dlg = document.createElement('div');
    dlg.id = 'hwxExtAppConfig';
    dlg.className = 'hwx-extapp-config-dlg';
    dlg.innerHTML =
      '<div class="hwx-extapp-config-card" role="dialog" aria-label="Configure external app">' +
        '<div class="hwx-extapp-config-title">External app tab</div>' +
        '<label class="hwx-extapp-field"><span>Label</span>' +
          '<input type="text" class="hwx-extapp-input hwx-extapp-label-in" maxlength="24" placeholder="App"></label>' +
        '<label class="hwx-extapp-field"><span>URL (http/https)</span>' +
          '<input type="url" class="hwx-extapp-input hwx-extapp-url-in" placeholder="https://app.example.com"></label>' +
        '<div class="hwx-extapp-config-note">To frame an external origin, the operator must allow it via ' +
          '<code>HERMES_WEBUI_CSP_FRAME_EXTRA</code>. Same-origin / loopback URLs work without it.</div>' +
        '<div class="hwx-extapp-config-err" hidden></div>' +
        '<div class="hwx-extapp-config-actions">' +
          '<button type="button" class="hwx-extapp-btn hwx-extapp-cancel">Cancel</button>' +
          '<button type="button" class="hwx-extapp-btn hwx-extapp-save">Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    const labelIn = dlg.querySelector('.hwx-extapp-label-in');
    const urlIn = dlg.querySelector('.hwx-extapp-url-in');
    const err = dlg.querySelector('.hwx-extapp-config-err');
    labelIn.value = app ? app.label : '';
    urlIn.value = app ? app.url : '';
    const close = () => dlg.remove();
    dlg.querySelector('.hwx-extapp-cancel').addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.querySelector('.hwx-extapp-save').addEventListener('click', () => {
      const url = urlIn.value.trim();
      const label = (labelIn.value.trim() || 'App').slice(0, 24);
      if (url && !validUrl(url)) {
        err.hidden = false;
        err.textContent = 'Enter a valid http(s) URL (or leave blank to clear).';
        return;
      }

      // Save to v2 data model
      const cfg = loadCfg();
      if (app && cfg.apps.some(a => a.id === app.id)) {
        cfg.apps = cfg.apps.map(a => a.id === app.id ? { ...a, url, label } : a);
      } else {
        cfg.apps = [{ id: uid(), url, label, icon: '' }];
      }
      saveCfg(cfg.apps);

      // refresh rail tooltip + overlay
      const btn = document.getElementById(RAIL_BTN_ID);
      if (btn) { btn.dataset.tooltip = label; btn.setAttribute('aria-label', label); }
      if (overlayOpen) renderOverlayContent();
      close();
    });
  }

  // ── install ─────────────────────────────────────────────────────────────

  function install(attempt) {
    attempt = attempt || 0;
    if (document.querySelector('.rail')) {
      ensureRailButton();
      window.HermesExternalAppTabExtension = {
        version: '0.2.0',
        getConfig: loadCfg,
        setConfig(url, label) {
          if (url && !validUrl(url)) return false;
          const cfg = loadCfg();
          const app = cfg.apps && cfg.apps.length > 0 ? cfg.apps[0] : null;
          if (app) {
            app.url = url || '';
            app.label = (label || 'App').slice(0, 24);
          } else {
            cfg.apps.push({ id: uid(), url: url || '', label: (label || 'App').slice(0, 24), icon: '' });
          }
          saveCfg(cfg.apps);
          const btn = document.getElementById(RAIL_BTN_ID);
          if (btn) { const a = currentApp(); btn.dataset.tooltip = a ? a.label : 'App'; btn.setAttribute('aria-label', a ? a.label : 'App'); }
          if (overlayOpen) renderOverlayContent();
          return true;
        },
        open: openOverlay,
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
