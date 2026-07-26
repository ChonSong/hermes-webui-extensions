(function () {
  'use strict';

  if (window.__PROOFSHOT_LOADED__) return;
  window.__PROOFSHOT_LOADED__ = true;

  var EXT_ID = 'proofshot';
  var PANEL_ID = 'panelProofShot';
  var BTN_CLASS = 'ps-sidebar-btn';
  var SIDECAR_PROXY = '/api/extensions/proofshot/sidecar';
  var STORAGE_KEY = 'ps-panel-open';

  // ---- State ----
  var state = {
    panelVisible: false,
    status: 'unknown',   // unknown | idle | recording
    version: null,
    artifacts: [],
    logLines: [],
    sidecarOk: false
  };

  // ---- Helpers ----
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return document.querySelectorAll(sel); }

  // ---- CSS Injection ----
  function injectCSS() {
    if (document.getElementById('ps-style')) return;
    var s = document.createElement('style');
    s.id = 'ps-style';
    s.textContent = getCSS();
    document.head.appendChild(s);
  }

  function getCSS() {
    return [
      '#panelProofShot { display: none; flex-direction: column; height: 100%; overflow: hidden; }',
      '#panelProofShot.active { display: flex; }',
      '.ps-header { padding: 10px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }',
      '.ps-header h3 { margin: 0; font-size: 13px; font-weight: 600; }',
      '.ps-header .ps-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }',
      '.ps-status-bar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); font-size: 12px; flex-shrink: 0; }',
      '.ps-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }',
      '.ps-dot.idle { background: #666; }',
      '.ps-dot.recording { background: #f85149; animation: ps-pulse 1.5s ease-in-out infinite; }',
      '.ps-dot.installed { background: #3fb950; }',
      '@keyframes ps-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }',
      '.ps-status-text { flex: 1; }',
      '.ps-actions { display: flex; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }',
      '.ps-btn { flex: 1; padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11px; cursor: pointer; text-align: center; transition: background 0.15s; }',
      '.ps-btn:hover { background: var(--hover); }',
      '.ps-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
      '.ps-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }',
      '.ps-btn.primary:hover { filter: brightness(1.15); }',
      '.ps-btn.danger { color: #f85149; border-color: #f85149; }',
      '.ps-btn.danger:hover { background: #f8514915; }',
      '.ps-artifacts { flex: 1; overflow-y: auto; padding: 6px 0; }',
      '.ps-artifact-item { padding: 8px 14px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; }',
      '.ps-artifact-item:hover { background: var(--hover); }',
      '.ps-artifact-item .ps-art-name { font-size: 12px; font-weight: 500; }',
      '.ps-artifact-item .ps-art-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }',
      '.ps-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; padding: 20px; text-align: center; }',
      '.ps-log { flex: 1; overflow-y: auto; padding: 8px 14px; font-family: SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 1.5; }',
      '.ps-log .ps-log-line { white-space: pre-wrap; word-break: break-all; }',
      // sidebar button
      '.ps-sidebar-btn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin: 0 6px; border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--text); transition: background 0.15s; }',
      '.ps-sidebar-btn:hover { background: var(--hover); }',
      '.ps-sidebar-btn.active { background: var(--accent-bg); color: var(--accent); }',
      '.ps-sidebar-btn .ps-btn-icon { font-size: 16px; line-height: 1; }',
      '.ps-sidebar-btn .ps-btn-label { flex: 1; }',
    ].join('');
  }

  // ---- Inject rail button ----
  function injectRailButton() {
    if (qs('.' + BTN_CLASS)) return;

    var rail = document.querySelector('.rail');
    if (!rail) {
      requestAnimationFrame(injectRailButton);
      return;
    }

    var btn = document.createElement('button');
    btn.className = BTN_CLASS + ' rail-btn has-tooltip';
    btn.setAttribute('data-tooltip', 'ProofShot');
    btn.setAttribute('aria-label', 'ProofShot');
    btn.innerHTML = '<span class="ps-btn-icon">\u25C9</span>';
    btn.addEventListener('click', function (ev) { ev.preventDefault(); togglePanel(); });

    var spacer = rail.querySelector('.rail-spacer');
    if (spacer) rail.insertBefore(btn, spacer);
    else rail.appendChild(btn);
  }

  // ---- Create panel ----
  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    var sidebar = qs('aside.sidebar');
    if (!sidebar) return;

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = [
      '<div class="ps-header">',
      '  <h3>ProofShot</h3>',
      '  <div class="ps-sub">Visual verification panel</div>',
      '</div>',
      '<div class="ps-status-bar" id="ps-status-bar">',
      '  <span class="ps-dot idle" id="ps-dot"></span>',
      '  <span class="ps-status-text" id="ps-status-text">Checking...</span>',
      '</div>',
      '<div class="ps-actions" id="ps-actions">',
      '  <button class="ps-btn primary" id="ps-start-btn" disabled>Start</button>',
      '  <button class="ps-btn danger" id="ps-stop-btn" disabled>Stop</button>',
      '  <button class="ps-btn" id="ps-refresh-btn">\u21BB</button>',
      '</div>',
      '<div class="ps-artifacts" id="ps-artifact-list">',
      '  <div class="ps-empty">No proofshot sessions found. Start a recording to generate artifacts.</div>',
      '</div>',
    ].join('');

    // Insert into sidebar alongside other panels
    var container = sidebar.querySelector('.panel-container');
    if (container) {
      container.appendChild(panel);
    } else {
      sidebar.appendChild(panel);
    }

    // Wire buttons
    document.getElementById('ps-start-btn').addEventListener('click', onStart);
    document.getElementById('ps-stop-btn').addEventListener('click', onStop);
    document.getElementById('ps-refresh-btn').addEventListener('click', refresh);
  }

  // ---- Panel toggle ----
  function togglePanel() {
    state.panelVisible = !state.panelVisible;
    var panel = document.getElementById(PANEL_ID);
    var btn = qs('.' + BTN_CLASS);
    if (panel) panel.classList.toggle('active', state.panelVisible);
    if (btn) btn.classList.toggle('active', state.panelVisible);
    if (state.panelVisible) refresh();
  }

  // ---- Sidecar communication ----
  async function sidecarCall(path, opts) {
    // Try via WebUI proxy first, fall back to direct
    async function tryUrl(url, signal) {
      var res = await fetch(url, {
        method: opts && opts.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
        signal: signal,
      });
      if (!res.ok) throw new Error('Status ' + res.status);
      return await res.json();
    }

    try {
      return await tryUrl(SIDECAR_PROXY + path, AbortSignal.timeout(3000));
    } catch (e) {
      // Fall back to direct sidecar access
      try {
        return await tryUrl('http://127.0.0.1:17990' + path, AbortSignal.timeout(2000));
      } catch (e2) {
        return { error: e2.message };
      }
    }
  }

  // ---- Check status ----
  async function refresh() {
    var dot = document.getElementById('ps-dot');
    var text = document.getElementById('ps-status-text');
    var startBtn = document.getElementById('ps-start-btn');
    var stopBtn = document.getElementById('ps-stop-btn');
    var list = document.getElementById('ps-artifact-list');

    if (!dot || !text) return;

    // Check sidecar first
    var health = await sidecarCall('/health');
    state.sidecarOk = !health.error;

    // Check if proofshot CLI is installed
    var which = await sidecarCall('/which');
    var installed = which && !which.error && which.path;

    // Check session status
    var session = installed ? await sidecarCall('/session') : { error: 'not installed' };

    if (session && !session.error && session.status === 'recording') {
      state.status = 'recording';
      dot.className = 'ps-dot recording';
      text.textContent = 'Recording active \u2014 ' + (session.description || 'no description');
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else if (installed) {
      state.status = 'idle';
      dot.className = 'ps-dot idle';
      text.textContent = 'Ready \u2014 ProofShot ' + (which.version || '');
      startBtn.disabled = false;
      stopBtn.disabled = true;
    } else {
      state.status = 'unknown';
      dot.className = 'ps-dot idle';
      text.textContent = 'ProofShot not found. Install with: npm install -g proofshot';
      startBtn.disabled = true;
      stopBtn.disabled = true;
    }

    // Load artifacts
    if (installed) {
      var arts = await sidecarCall('/artifacts');
      if (arts && !arts.error && arts.sessions) {
        state.artifacts = arts.sessions;
        renderArtifacts(list);
      }
    }
  }

  // ---- Start / Stop ----
  async function onStart() {
    var startBtn = document.getElementById('ps-start-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    var result = await sidecarCall('/start', {
      method: 'POST',
      body: { workdir: (typeof S !== 'undefined' && S.workspace) || window.location.pathname.match(/\/workspace\/([^/]+)/)?.[1] || '' },
    });

    startBtn.textContent = 'Start';
    if (result && !result.error) {
      addLog('Session started successfully', 'ok');
    } else {
      addLog('Start failed: ' + (result.error || 'unknown'), 'err');
      startBtn.disabled = false;
    }
    refresh();
  }

  async function onStop() {
    var stopBtn = document.getElementById('ps-stop-btn');
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';

    var result = await sidecarCall('/stop', { method: 'POST' });

    stopBtn.textContent = 'Stop';
    if (result && !result.error) {
      addLog('Session stopped. Artifacts saved.', 'ok');
    } else {
      addLog('Stop failed: ' + (result.error || 'unknown'), 'err');
      stopBtn.disabled = false;
    }
    refresh();
  }

  // ---- Render artifacts ----
  function renderArtifacts(container) {
    if (!container) return;

    if (state.artifacts.length === 0) {
      container.innerHTML = '<div class="ps-empty">No proofshot sessions yet. Start a recording to see artifacts here.</div>';
      return;
    }

    container.innerHTML = state.artifacts.map(function (s) {
      var errCount = (s.errors || []).length;
      var errHtml = errCount > 0 ? '<div class="ps-art-errors">\u26A0 ' + errCount + ' error' + (errCount > 1 ? 's' : '') + '</div>' : '';
      return '<div class="ps-artifact-item" data-dir="' + (s.dir || '') + '">' +
        '<div class="ps-art-name">' + (s.description || s.dir || 'Session') + '</div>' +
        '<div class="ps-art-meta">' + (s.timestamp || '') + ' \u2022 ' + (s.duration || '?') + 's \u2022 ' + (s.screenshots || 0) + ' screenshots</div>' +
        errHtml +
        '</div>';
    }).join('');

    // Click to open viewer
    container.querySelectorAll('.ps-artifact-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var dir = el.getAttribute('data-dir');
        if (dir) {
          // Try to open viewer.html using the WebUI file API
          window.open('/api/files/read/' + encodeURIComponent(dir + '/viewer.html'));
        }
      });
    });
  }

  // ---- Log ----
  function addLog(msg, type) {
    state.logLines.push({ msg: msg, type: type || 'info' });
    var logEl = document.getElementById('ps-log-area');
    if (!logEl) return;
    var line = document.createElement('div');
    line.className = 'ps-log-line ps-log-' + (type || 'info');
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // ---- Init ----
  function init(attempt) {
    if (attempt > 30) return;
    var sidebar = qs('aside.sidebar');
    if (!sidebar) {
      setTimeout(function () { init(attempt + 1); }, 200);
      return;
    }

    injectCSS();
    injectRailButton();
    createPanel();

    // Auto-refresh every 10s when panel is open
    setInterval(function () {
      if (state.panelVisible) refresh();
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(1); }, { once: true });
  } else {
    setTimeout(function () { init(1); }, 1000);
  }
})();
