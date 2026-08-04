/*
 * Docker & Tunnel Manager — WebUI adapter (manifest-bundle IIFE)
 *
 * Pinned to hermes-webui/docker-tunnel-sidecar@v0.3.0.
 * All sidecar calls go through _scrapeOrigin() -> fetch() with auth header.
 * No string interpolation into HTML; all dynamic values via textContent/setAttribute.
 *
 * Required permissions (declared in extension.json):
 *   loopback_sidecar, network_external, dom.owned, dom.mutates_core_views,
 *   storage.owned, webui_api.read: sessions
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * IIFE-scoped lifecycle state (plan B3)                               *
   * ------------------------------------------------------------------ */
  let gPollTimer = null;
  let gPollGeneration = 0;       // invalidates stale in-flight polls
  let gActiveTab = 'containers';
  let gPanel = null;             // owned DOM root
  let gTabButtons = {};          // tabId -> <button>
  let gContainers = [];          // last-fetched container list
  let gLogsOverlay = null;       // logs modal reference

  /* ------------------------------------------------------------------ *
   * Storage accessors (sanctioned; never raw localStorage)              *
   * ------------------------------------------------------------------ */
  function _getKey(key) {
    return `docker-tunnel-manager.${key}`;
  }
  function _loadSetting(key, fallback) {
    const raw = localStorage.getItem(_getKey(key));
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function _saveSetting(key, value) {
    localStorage.setItem(_getKey(key), JSON.stringify(value));
  }

  /* ------------------------------------------------------------------ *
   * Sidecar config (B5 — sidecarPort removed, only origin + interval)   *
   * ------------------------------------------------------------------ */
  function _scrapeOrigin() {
    return _loadSetting('sidecar_origin', 'http://127.0.0.1:17788');
  }
  function _autoRefreshMs() {
    return _loadSetting('auto_refresh_ms', 5000);
  }

  /* ------------------------------------------------------------------ *
   * Sidecar fetch with auth + deadline                                  *
   * ------------------------------------------------------------------ */
  function _scrape(path, opts) {
    const origin = _scrapeOrigin();
    const url = `${origin}${path}`;
    const headers = Object.assign({}, opts && opts.headers);
    // Auth token injected by the sidecar's manifest; read once per call.
    const token = _loadSetting('sidecar_token', null);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeoutMs = 8000; // inside the ~10s proxy envelope (plan A4)
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    return fetch(url, Object.assign({}, opts, {
      headers,
      signal: controller ? controller.signal : undefined,
    })).then(function (res) {
      if (timeoutId) clearTimeout(timeoutId);
      return res;
    }).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      throw err;
    });
  }

  /* ------------------------------------------------------------------ *
   * Context-safe rendering (plan B1)                                    *
   * ------------------------------------------------------------------ */
  function _text(node, value) {
    node.textContent = String(value == null ? '' : value);
    return node;
  }
  function _attr(node, name, value) {
    node.setAttribute(name, String(value == null ? '' : value));
    return node;
  }
  function _clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* ------------------------------------------------------------------ *
   * Confirmation dialog (plan B5 — text nodes + real <strong>)          *
   * ------------------------------------------------------------------ */
  function _confirmDangerous(actionLabel, detail, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'hwx-dtm-confirm-overlay';

    const box = document.createElement('div');
    box.className = 'hwx-dtm-confirm-box';

    const title = document.createElement('h3');
    title.textContent = 'Confirm destructive action'; // safe static text
    box.appendChild(title);

    const msg = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = actionLabel;
    msg.appendChild(strong);
    if (detail) {
      msg.appendChild(document.createTextNode(' — '));
      msg.appendChild(document.createTextNode(detail));
    }
    box.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'hwx-dtm-confirm-actions';

    const cancel = document.createElement('button');
    cancel.className = 'hwx-dtm-btn hwx-dtm-btn-secondary';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { overlay.remove(); });

    const ok = document.createElement('button');
    ok.className = 'hwx-dtm-btn hwx-dtm-btn-danger';
    ok.textContent = actionLabel;
    ok.addEventListener('click', function () { overlay.remove(); onConfirm(); });

    actions.appendChild(cancel);
    actions.appendChild(ok);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ------------------------------------------------------------------ *
   * Tab lifecycle (plan B3 — generation-token poll invalidation)       *
   * ------------------------------------------------------------------ */
  function _startPolling() {
    _stopPolling();
    const interval = _autoRefreshMs();
    if (interval <= 0) return;
    gPollTimer = setInterval(function () {
      const gen = gPollGeneration;
      _refreshActiveTab().catch(function (err) {
        // Only render error if this generation is still current.
        if (gen === gPollGeneration) _renderError(err);
      });
    }, interval);
  }
  function _stopPolling() {
    if (gPollTimer) { clearInterval(gPollTimer); gPollTimer = null; }
  }
  function _invalidatePolls() {
    gPollGeneration++;
    _stopPolling();
  }

  function _switchTab(tabId) {
    // B3: generation-token invalidation on tab switch
    _invalidatePolls();
    gActiveTab = tabId;
    _saveSetting('active_tab', tabId);
    _renderPanel();
    _startPolling();
  }

  function _closeOverlay() {
    // B3: clean cancel — cannot throw, releases generation token
    _invalidatePolls();
    if (gLogsOverlay) { gLogsOverlay.remove(); gLogsOverlay = null; }
    if (gPanel) { gPanel.remove(); gPanel = null; }
    gTabButtons = {};
  }

  /* ------------------------------------------------------------------ *
   * Route table (mirrors sidecar v0.3.0 — exact match, no string eval)  *
   * ------------------------------------------------------------------ */
  const ROUTES = {
    containers: {
      list: '/api/containers',
      action: '/api/containers',
      logs: '/api/containers',
    },
    images:     { list: '/api/images',     action: '/api/images' },
    volumes:    { list: '/api/volumes',    action: '/api/volumes' },
    networks:   { list: '/api/networks',   info: '/api/networks' },
    compose:    { list: '/api/compose' },
    tunnels:    { list: '/api/tunnels',    action: '/api/tunnels' },
  };

  /* ------------------------------------------------------------------ *
   * Container action helpers                                             *
   * ------------------------------------------------------------------ */
  function _containerAction(containerId, action) {
    const path = `/api/containers/${containerId}/${action}`;
    return _scrape(path, { method: 'POST' }).then(function (res) {
      if (!res.ok) throw new Error(`HTTP ${res.status} ${action} ${containerId}`);
      return res.json();
    });
  }

  function _containerLogs(containerId, tail) {
    const params = tail ? `?tail=${encodeURIComponent(tail)}` : '';
    return _scrape(`/api/containers/${containerId}/logs${params}`)
      .then(function (res) {
        if (!res.ok) throw new Error(`HTTP ${res.status} logs ${containerId}`);
        return res.json();
      });
  }

  function _refreshActiveTab() {
    const route = ROUTES[gActiveTab];
    if (!route || !route.list) return Promise.resolve(null);
    return _scrape(route.list).then(function (res) {
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${route.list}`);
      return res.json();
    }).then(function (data) {
      if (gPollGeneration) _renderTabData(gActiveTab, data);
      return data;
    });
  }

  function _renderError(err) {
    if (!gPanel) return;
    const host = gPanel.querySelector('.hwx-dtm-error-host');
    if (!host) return;
    _clear(host);
    const msg = document.createElement('div');
    msg.className = 'hwx-dtm-error-msg';
    msg.textContent = err.message || String(err);
    host.appendChild(msg);
  }

  /* ------------------------------------------------------------------ *
   * Tab renderers (stubs — flesh out in subsequent phases)              *
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * Containers tab                                                       *
   * ------------------------------------------------------------------ */
  function _renderTabContainers(data) {
    const body = gPanel && gPanel.querySelector('.hwx-dtm-body');
    if (!body) return;
    _clear(body);

    if (!Array.isArray(data) || data.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hwx-dtm-empty';
      empty.textContent = 'No containers found.';
      body.appendChild(empty);
      return;
    }

    gContainers = data;
    const table = document.createElement('div');
    table.className = 'hwx-dtm-table';

    for (const c of data) {
      const id = c.Id || c.id || '';
      const name = (c.Names && c.Names[0]) || (c.names && c.names[0]) || id.slice(0, 12);
      const state = c.State || c.state || 'unknown';
      const image = c.Image || c.image || '';
      const status = c.Status || c.status || '';

      const row = document.createElement('div');
      row.className = 'hwx-dtm-row';

      const info = document.createElement('div');
      info.className = 'hwx-dtm-row-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'hwx-dtm-row-name';
      nameEl.textContent = name;
      info.appendChild(nameEl);
      const meta = document.createElement('div');
      meta.className = 'hwx-dtm-row-meta';
      meta.textContent = `${state} · ${image} · ${status}`;
      info.appendChild(meta);
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'hwx-dtm-row-actions';

      const isRunning = state === 'running';

      // Stop / Start
      if (isRunning) {
        const stopBtn = document.createElement('button');
        stopBtn.className = 'hwx-dtm-btn hwx-dtm-btn-danger';
        stopBtn.textContent = 'Stop';
        stopBtn.addEventListener('click', function () {
          _confirmDangerous('Stop container', name, function () {
            _containerAction(id, 'stop').then(function () {
              _refreshActiveTab();
            }).catch(_renderError);
          });
        });
        actions.appendChild(stopBtn);
      } else {
        const startBtn = document.createElement('button');
        startBtn.className = 'hwx-dtm-btn hwx-dtm-btn-primary';
        startBtn.textContent = 'Start';
        startBtn.addEventListener('click', function () {
          _containerAction(id, 'start').then(function () {
            _refreshActiveTab();
          }).catch(_renderError);
        });
        actions.appendChild(startBtn);
      }

      // Restart
      const restartBtn = document.createElement('button');
      restartBtn.className = 'hwx-dtm-btn hwx-dtm-btn-secondary';
      restartBtn.textContent = 'Restart';
      restartBtn.addEventListener('click', function () {
        _confirmDangerous('Restart container', name, function () {
          _containerAction(id, 'restart').then(function () {
            _refreshActiveTab();
          }).catch(_renderError);
        });
      });
      actions.appendChild(restartBtn);

      // Logs
      const logsBtn = document.createElement('button');
      logsBtn.className = 'hwx-dtm-btn hwx-dtm-btn-secondary';
      logsBtn.textContent = 'Logs';
      logsBtn.addEventListener('click', function () {
        _openLogsModal(id, name);
      });
      actions.appendChild(logsBtn);

      row.appendChild(actions);
      table.appendChild(row);
    }

    body.appendChild(table);
  }

  /* ------------------------------------------------------------------ *
   * Logs modal                                                            *
   * ------------------------------------------------------------------ */
  function _openLogsModal(containerId, containerName) {
    if (gLogsOverlay) gLogsOverlay.remove();

    const overlay = document.createElement('div');
    overlay.className = 'hwx-dtm-logs-overlay';
    gLogsOverlay = overlay;

    const box = document.createElement('div');
    box.className = 'hwx-dtm-logs-box';

    const header = document.createElement('header');
    header.className = 'hwx-dtm-logs-header';
    const title = document.createElement('h3');
    title.textContent = 'Logs — ';
    const nameEl = document.createElement('strong');
    nameEl.textContent = containerName;
    title.appendChild(nameEl);
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'hwx-dtm-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () { overlay.remove(); gLogsOverlay = null; });
    header.appendChild(closeBtn);
    box.appendChild(header);

    const tailRow = document.createElement('div');
    tailRow.className = 'hwx-dtm-logs-controls';
    const tailLabel = document.createElement('label');
    tailLabel.textContent = 'Tail lines: ';
    tailRow.appendChild(tailLabel);
    const tailInput = document.createElement('input');
    tailInput.type = 'number';
    tailInput.min = '1';
    tailInput.max = '1000';
    tailInput.value = '100';
    tailRow.appendChild(tailInput);
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'hwx-dtm-btn hwx-dtm-btn-secondary';
    refreshBtn.textContent = 'Refresh';
    tailRow.appendChild(refreshBtn);
    box.appendChild(tailRow);

    const pre = document.createElement('pre');
    pre.className = 'hwx-dtm-logs-body';
    pre.textContent = 'Loading logs…';
    box.appendChild(pre);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function fetchLogs() {
      const tail = parseInt(tailInput.value, 10);
      const clampedTail = Math.min(1000, Math.max(1, isNaN(tail) ? 100 : tail));
      _containerLogs(containerId, clampedTail).then(function (data) {
        pre.textContent = (data && (data.logs || data.output || data)) || '(no output)';
      }).catch(function (err) {
        pre.textContent = err.message || String(err);
      });
    }

    refreshBtn.addEventListener('click', fetchLogs);
    fetchLogs();
  }
  function _renderTabImages(data)     { /* TODO: list/history/remove */ }
  function _renderTabVolumes(data)    { /* TODO: list/usage/remove */ }
  function _renderTabNetworks(data)   { /* TODO: list/inspect */ }
  function _renderTabCompose(data)    { /* TODO: project status */ }
  function _renderTabTunnels(data)    { /* TODO: status/start/stop */ }

  const TAB_RENDERERS = {
    containers: _renderTabContainers,
    images: _renderTabImages,
    volumes: _renderTabVolumes,
    networks: _renderTabNetworks,
    compose: _renderTabCompose,
    tunnels: _renderTabTunnels,
  };

  function _renderTabData(tabId, data) {
    const fn = TAB_RENDERERS[tabId];
    if (fn) fn(data);
  }

  /* ------------------------------------------------------------------ *
   * Panel render                                                        *
   * ------------------------------------------------------------------ */
  function _renderPanel() {
    if (!gPanel) {
      gPanel = document.createElement('div');
      gPanel.className = 'hwx-dtm-panel';
      document.body.appendChild(gPanel);
    }
    _clear(gPanel);

    const header = document.createElement('header');
    header.className = 'hwx-dtm-header';
    const title = document.createElement('h2');
    title.textContent = 'Docker & Tunnel Manager';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'hwx-dtm-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close panel');
    closeBtn.addEventListener('click', _closeOverlay);
    header.appendChild(closeBtn);
    gPanel.appendChild(header);

    const tabs = document.createElement('nav');
    tabs.className = 'hwx-dtm-tabs';
    const tabDefs = [
      ['containers', 'Containers'],
      ['images', 'Images'],
      ['volumes', 'Volumes'],
      ['networks', 'Networks'],
      ['compose', 'Compose'],
      ['tunnels', 'Tunnels'],
      ['settings', 'Settings'],
    ];
    for (const [id, label] of tabDefs) {
      const btn = document.createElement('button');
      btn.className = 'hwx-dtm-tab';
      btn.textContent = label;
      _attr(btn, 'data-tab', id);
      if (id === gActiveTab) btn.classList.add('hwx-dtm-tab-active');
      btn.addEventListener('click', function () { _switchTab(id); });
      tabs.appendChild(btn);
      gTabButtons[id] = btn;
    }
    gPanel.appendChild(tabs);

    const body = document.createElement('main');
    body.className = 'hwx-dtm-body';
    body.textContent = `Loading ${gActiveTab}…`;
    gPanel.appendChild(body);

    const errHost = document.createElement('div');
    errHost.className = 'hwx-dtm-error-host';
    gPanel.appendChild(errHost);
  }

  /* ------------------------------------------------------------------ *
   * Ensure titlebar button (install hook)                               *
   * ------------------------------------------------------------------ */
  function _ensureTitlebarButton() {
    const existing = document.querySelector('[data-dtm-launcher]');
    if (existing) return;

    const btn = document.createElement('button');
    btn.className = 'hwx-dtm-launcher';
    btn.textContent = '🐳';
    _attr(btn, 'data-dtm-launcher', 'true');
    _attr(btn, 'aria-label', 'Open Docker & Tunnel Manager');
    btn.addEventListener('click', function () {
      if (gPanel) { _closeOverlay(); return; }
      _renderPanel();
      _startPolling();
    });

    const titlebar = document.querySelector('.titlebar, [data-titlebar]');
    if (titlebar) titlebar.appendChild(btn);
  }

  /* ------------------------------------------------------------------ *
   * Install                                                            *
   * ------------------------------------------------------------------ */
  function install() {
    // Restore last-active tab
    gActiveTab = _loadSetting('active_tab', 'containers');
    _ensureTitlebarButton();
    // Health probe sidecar before rendering.
    _scrape('/health').then(function (res) {
      if (!res.ok) {
        console.warn('[docker-tunnel-manager] sidecar health probe failed', res.status);
      }
    }).catch(function (err) {
      console.warn('[docker-tunnel-manager] sidecar unreachable', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  // Expose for tests / external trigger.
  if (typeof window !== 'undefined') {
    window.__dockerTunnelManager = {
      open: function () { if (!gPanel) { _renderPanel(); _startPolling(); } },
      close: _closeOverlay,
      switchTab: _switchTab,
    };
  }
})();
