/**
 * Project Allocator Extension v0.1.0
 * LLM-powered project suggestions for unassigned sessions.
 * Button sits in .project-bar; panel is a floating overlay.
 */
(() => {
  'use strict';
  const EXT_ID = 'project-allocator';
  if (window.__projAllocLoaded) return;
  window.__projAllocLoaded = true;

  /* ── State ── */
  const state = {
    panelVisible: false,
    sessions: [],
    projects: [],
    suggestions: {},
    undoStack: [],
    isLoading: false,
    _panelEl: null,
    _observer: null,
  };

  /* ── Settings ── */
  function getSetting(key, def) {
    try {
      if (window.HermesExtensionSettings) {
        const s = window.HermesExtensionSettings.settingsForExtension(EXT_ID);
        return s.get(key) != null ? s.get(key) : def;
      }
    } catch (_) {}
    return def;
  }

  function storeGet(key) {
    try {
      const s = window.HermesExtensionSettings.storageForExtension(EXT_ID);
      return s.get(key);
    } catch (_) { return null; }
  }
  function storeSet(key, val) {
    try {
      const s = window.HermesExtensionSettings.storageForExtension(EXT_ID);
      s.set(key, val);
    } catch (_) {}
  }

  /* ── Undo stack ── */
  function loadUndoStack() {
    try {
      const raw = storeGet('undoStack');
      if (Array.isArray(raw)) state.undoStack = raw;
    } catch (_) { state.undoStack = []; }
  }
  function saveUndoStack() {
    const max = getSetting('max_undo_stack', 20);
    if (state.undoStack.length > max) state.undoStack = state.undoStack.slice(-max);
    storeSet('undoStack', state.undoStack);
  }

  /* ── API (use global api() from workspace.js for CSRF+auth compat) ── */
  async function api(method, path, body) {
    if (typeof window.api === 'function') {
      // Use WebUI's own api() — handles CSRF token, credentials, retries, timeouts
      const fetchOpts = { method };
      if (body) fetchOpts.body = JSON.stringify(body);
      return await window.api(path, fetchOpts);
    }
    // Fallback for testing without WebUI globals
    const opts = { method, credentials: 'include', headers: {} };
    if (body) {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`API ${method} ${path} ${res.status}: ${txt.slice(0, 100)}`);
    }
    return res.json();
  }

  /* ── Data ── */
  async function fetchData() {
    // If globals exist AND are non-empty, use them. Otherwise hit the API directly.
    const _p = (typeof _allProjects !== 'undefined' && Array.isArray(_allProjects)) ? _allProjects : null;
    const _s = (typeof _allSessions !== 'undefined' && Array.isArray(_allSessions)) ? _allSessions : null;

    if (_p && _p.length > 0) {
      state.projects = _p;
    } else {
      try { state.projects = (await api('GET', '/api/projects')).projects || []; }
      catch (e) { console.warn('[ProjAlloc] Failed to fetch projects:', e); state.projects = []; }
    }
    if (_s && _s.length > 0) {
      state.sessions = _s;
    } else {
      try { state.sessions = (await api('GET', '/api/sessions?limit=500')).sessions || []; }
      catch (e) { console.warn('[ProjAlloc] Failed to fetch sessions:', e); state.sessions = []; }
    }
  }

  function getUnassigned() {
    return state.sessions.filter(s => !s.project_id);
  }

  /* ── Keyword matching engine ── */
  function stem(w) {
    // Lightweight singular/plural normalization
    if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
    if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
    return w;
  }
  function fuzzyMatch(pw, titleWords) {
    const stemmed = stem(pw);
    for (const tw of titleWords) {
      if (tw === pw) return 1.0;             // exact
      if (tw === stemmed) return 0.9;        // singular/plural
      if (tw.startsWith(pw) || pw.startsWith(tw)) return 0.8;  // prefix
      if (tw.includes(pw) || pw.includes(tw)) return 0.7;      // substring
      if (stem(tw) === stemmed) return 0.85; // both stemmed
    }
    return 0;
  }
  function keywordSuggest() {
    const projData = {};
    state.projects.forEach(p => {
      const orig = p.name || '';
      const name = orig.toLowerCase();
      const words = new Set();
      // Split on the ORIGINAL casing first so camelCase/PascalCase boundary tokens
      // survive (lowercasing before the boundaries split would kill them). Handles
      // both MyProject -> [my, project] and CMSTool / HTTPShim -> [cms, tool]/[http, shim].
      orig.split(/[\s\-_.]+/).forEach(w => {
        if (w.length >= 2) words.add(w.toLowerCase());
        const camelParts = w
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')      // lower/digit -> Upper
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // acronym run -> TitleCase
          .toLowerCase()
          .split(/\s+/);
        camelParts.forEach(cp => { if (cp.length >= 2) words.add(cp); });
      });
      if (name.length >= 2) words.add(name);
      projData[p.project_id] = { words, name_lower: name, name_orig: p.name };
    });

    const suggestions = {};
    getUnassigned().forEach(s => {
      const title = (s.title || '').toLowerCase();
      const source = (s.source_tag || s.raw_source || '').toLowerCase();
      const haystack = title + ' ' + source;
      const titleWords = Array.from(new Set(haystack.split(/[\s\-_.]+/).filter(w => w.length >= 2)));

      let bestPid = null;
      let bestScore = 0;

      for (const [pid, pd] of Object.entries(projData)) {
        if (pd.words.size === 0) continue;
        let score = 0;

        // Fuzzy word match
        for (const pw of pd.words) {
          score = Math.max(score, fuzzyMatch(pw, titleWords) * 0.5);
        }
        // Full project name substring in title
        if (pd.name_lower.length >= 2 && haystack.includes(pd.name_lower)) {
          score = Math.max(score, 0.5);
        }
        // Source tag exact word match
        if (source && pd.words.has(source)) {
          score = Math.max(score, 0.7);
        }

        if (score > bestScore) {
          bestScore = score;
          bestPid = pid;
        }
      }

      if (bestPid && bestScore >= 0.25) {
        const conf = bestScore >= 0.6 ? 'high' : bestScore >= 0.4 ? 'medium' : 'low';
        suggestions[s.session_id] = { project_id: bestPid, confidence: conf };
      }
    });
    return suggestions;
  }

  /* ── LLM Suggestion (now client-side keyword matcher) ── */
  async function suggestProjects() {
    const unassigned = getUnassigned();
    if (unassigned.length === 0) { state.suggestions = {}; return; }
    state.isLoading = true;
    renderBody();
    try {
      state.suggestions = keywordSuggest();
    } catch (err) {
      console.warn('[ProjAlloc] Suggestion failed:', err);
      showToast('Suggestion failed: ' + err.message, 'error');
      state.suggestions = {};
    } finally {
      state.isLoading = false;
      renderBody();
    }
  }

  /* ── Assign / Undo / Regenerate ── */
  async function assignSession(sessionId, projectId) {
    if (!sessionId || !projectId) return;
    const s = state.sessions.find(x => x.session_id === sessionId);
    const prevProjectId = s ? s.project_id : null;
    try {
      await api('POST', '/api/session/move', { session_id: sessionId, project_id: projectId });
      state.undoStack.push({ session_id: sessionId, project_id: prevProjectId, target_project_id: projectId, timestamp: Date.now() });
      saveUndoStack();
      if (s) s.project_id = projectId;
      if (typeof _renderSessions === 'function') _renderSessions();
      showToast(`Assigned to ${getProjectName(projectId)}`);
      renderBody();
    } catch (err) {
      showToast('Assignment failed: ' + err.message, 'error');
    }
  }

  async function undoLast() {
    if (state.undoStack.length === 0) return;
    const last = state.undoStack.pop();
    saveUndoStack();
    try {
      await api('POST', '/api/session/move', { session_id: last.session_id, project_id: last.project_id });
      const s = state.sessions.find(x => x.session_id === last.session_id);
      if (s) s.project_id = last.project_id;
      if (typeof _renderSessions === 'function') _renderSessions();
      showToast('Undone: ' + (getProjectName(last.target_project_id) || 'unassigned'));
      renderBody();
    } catch (err) {
      showToast('Undo failed: ' + err.message, 'error');
      state.undoStack.push(last);
      saveUndoStack();
    }
  }

  /* ── Fetch last user message for sessions ── */
  async function fetchLastUserMessages() {
    // Wait for globals to populate if needed
    if (typeof _allSessions === 'undefined' || !_allSessions.length) {
      await fetchData();
    }
    
    const unassigned = getUnassigned();
    const needsFetch = unassigned.filter(s => s._lastUserMessage == null);
    if (needsFetch.length === 0) return;
    
    for (const s of needsFetch) {
      try {
        let data = null;
        // Use window.api if available, fall back to raw fetch
        try {
          if (typeof window.api === 'function') {
            const result = await window.api('/api/session?session_id=' + encodeURIComponent(s.session_id) + '&messages=1&resolve_model=0&msg_limit=10');
            data = result?.session?.messages || result?.messages || [];
          }
        } catch(e) {}
        
        if (!data) {
          // Fallback to raw fetch with credentials
          const resp = await fetch('/api/session?session_id=' + encodeURIComponent(s.session_id) + '&messages=1&resolve_model=0&msg_limit=10', {
            credentials: 'include',
          });
          if (!resp.ok) { s._lastUserMessage = ''; continue; }
          const result = await resp.json();
          data = result?.session?.messages || result?.messages || [];
        }
        
        const lastUser = [...data].reverse().find(m => m.role === 'user');
        s._lastUserMessage = lastUser ? (lastUser.content || '').slice(0, 120) : '';
      } catch (err) {
        s._lastUserMessage = '';
      }
    }
  }

  /* ── Batch regenerate titles ── */
  async function regenerateAllTitles() {
    const unassigned = getUnassigned();
    if (unassigned.length === 0) return;
    
    state.isLoading = true;
    renderBody();
    
    let success = 0;
    let failed = 0;
    
    try {
      for (const s of unassigned) {
        try {
          const resp = await api('POST', '/api/session/title/regenerate', {
            session_id: s.session_id,
          });
          const newTitle = (resp && resp.title) || (resp && resp.session && resp.session.title) || '';
          if (newTitle) {
            s.title = newTitle;
            // Also update the sidebar cache if present
            if (typeof _allSessions !== 'undefined') {
              const cached = _allSessions.find(x => x.session_id === s.session_id);
              if (cached) cached.title = newTitle;
            }
            success++;
          } else {
            failed++;
          }
        } catch (err) {
          console.warn('[ProjAlloc] Regenerate failed for', s.session_id, err);
          failed++;
        }
      }
      
      if (typeof _renderSessions === 'function') _renderSessions();
      
      const parts = [];
      if (success > 0) parts.push(`${success} regenerated`);
      if (failed > 0) parts.push(`${failed} failed`);
      showToast(`Titles: ${parts.join(', ')}`);
    } catch (err) {
      showToast('Regenerate all failed: ' + err.message, 'error');
    } finally {
      state.isLoading = false;
      renderBody();
    }
  }

  function getProjectName(pid) { return pid ? (state.projects.find(x => x.project_id === pid) || {}).name || pid : 'Unassigned'; }

  function showToast(msg, type) {
    document.querySelectorAll('.ext-projalloc-toast').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'ext-projalloc-toast';
    el.textContent = msg;
    if (type === 'error') el.style.borderColor = '#e74c3c';
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2500);
    setTimeout(() => el.remove(), 3000);
  }

  /* ── Inject button into .project-bar ── */
  function injectProjectBarButton() {
    const bar = document.querySelector('.project-bar');
    if (!bar) return;
    if (bar.querySelector('.ext-projalloc-bar-btn')) return; // already injected

    const btn = document.createElement('span');
    btn.className = 'project-chip ext-projalloc-bar-btn';
    btn.title = 'Project Allocator — suggest & assign projects for unassigned sessions (Alt+P)';
    btn.style.cursor = 'pointer';

    // Badge showing unassigned count
    const badge = document.createElement('span');
    badge.className = 'ext-projalloc-bar-badge';
    badge.id = 'ext-projalloc-bar-badge';
    badge.textContent = String(getUnassigned().length);

    btn.innerHTML = '🎯 Allocator ';
    btn.appendChild(badge);

    btn.onclick = (e) => {
      e.stopPropagation();
      togglePanel();
    };

    bar.appendChild(btn);
  }

  /* ── Watch for project bar re-renders ── */
  function startBarObserver() {
    if (state._observer) state._observer.disconnect();
    state._observer = new MutationObserver(() => {
      injectProjectBarButton();
    });
    // Watch the whole sidebar area for changes
    const sidebar = document.getElementById('sessionSidebar') || document.querySelector('.sidebar-session-list') || document.body;
    state._observer.observe(sidebar, { childList: true, subtree: true });
    // Also watch document.body as fallback
    if (sidebar !== document.body) {
      state._observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function updateBarBadge() {
    const badge = document.getElementById('ext-projalloc-bar-badge');
    if (badge) {
      const count = getUnassigned().length;
      badge.textContent = count > 99 ? '99+' : count;
    }
  }

  /* ── Panel ── */
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'ext-projalloc-panel';

    const header = document.createElement('div');
    header.className = 'ext-projalloc-header';
    const title = document.createElement('h3');
    title.innerHTML = '📋 Project Allocator' + '<span id="ext-projalloc-badge" class="ext-projalloc-badge">0</span>';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'ext-projalloc-header-actions';
    
    const suggestBtn = document.createElement('button');
    suggestBtn.className = 'ext-projalloc-btn ext-projalloc-btn-primary ext-projalloc-btn-small';
    suggestBtn.textContent = '✨ Suggest';
    suggestBtn.id = 'ext-projalloc-suggest-btn';
    suggestBtn.onclick = () => suggestProjects();
    actions.appendChild(suggestBtn);
    
    const regenBtn = document.createElement('button');
    regenBtn.className = 'ext-projalloc-btn ext-projalloc-btn-small';
    regenBtn.textContent = '🔄 Titles';
    regenBtn.id = 'ext-projalloc-regen-btn';
    regenBtn.title = 'Regenerate titles for all unassigned sessions';
    regenBtn.onclick = () => regenerateAllTitles();
    actions.appendChild(regenBtn);
    
    const undoBtn = document.createElement('button');
    undoBtn.className = 'ext-projalloc-btn ext-projalloc-btn-small ext-projalloc-btn-danger';
    undoBtn.textContent = '↩ Undo';
    undoBtn.id = 'ext-projalloc-undo-btn';
    undoBtn.onclick = () => undoLast();
    actions.appendChild(undoBtn);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ext-projalloc-btn-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close';
    closeBtn.onclick = () => togglePanel(false);
    actions.appendChild(closeBtn);
    
    header.appendChild(actions);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'ext-projalloc-body';
    body.id = 'ext-projalloc-body';
    panel.appendChild(body);
    return panel;
  }

  function renderBody() {
    const body = document.getElementById('ext-projalloc-body');
    if (!body) return;
    body.innerHTML = '';
    const unassigned = getUnassigned();
    const badge = document.getElementById('ext-projalloc-badge');
    if (badge) badge.textContent = unassigned.length;
    const undoBtn = document.getElementById('ext-projalloc-undo-btn');
    if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
    const suggestBtn = document.getElementById('ext-projalloc-suggest-btn');
    if (suggestBtn) suggestBtn.disabled = state.isLoading || unassigned.length === 0;
    updateBarBadge();

    if (state.isLoading) {
      const spinner = document.createElement('div');
      spinner.className = 'ext-projalloc-spinner';
      body.appendChild(spinner);
      return;
    }
    if (unassigned.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ext-projalloc-empty';
      empty.innerHTML = '<strong>✅ All assigned!</strong>No unassigned sessions.';
      body.appendChild(empty);
      return;
    }

    const hasSuggestions = Object.keys(state.suggestions).length > 0;
    const matchedCount = hasSuggestions
      ? Object.values(state.suggestions).filter(s => s && s.project_id).length
      : 0;

    if (!hasSuggestions) {
      const hint = document.createElement('div');
      hint.className = 'ext-projalloc-empty';
      hint.style.padding = '16px 14px';
      hint.style.fontSize = '11px';
      hint.textContent = 'Click "Suggest" to classify via LLM, or pick a project from the dropdown and click ✓ to assign manually.';
      body.appendChild(hint);
    } else if (matchedCount === 0) {
      const hint = document.createElement('div');
      hint.className = 'ext-projalloc-empty';
      hint.style.padding = '10px 14px';
      hint.style.fontSize = '11px';
      hint.textContent = 'No strong keyword matches found. Pick a project from each dropdown and click ✓ to assign manually.';
      body.appendChild(hint);
    } else {
      const summary = document.createElement('div');
      summary.className = 'ext-projalloc-empty';
      summary.style.padding = '8px 14px';
      summary.style.fontSize = '11px';
      summary.textContent = matchedCount + ' of ' + unassigned.length + ' sessions matched.';
      body.appendChild(summary);
    }

    unassigned.forEach(s => {
      const sug = state.suggestions[s.session_id];
      const suggestedPid = sug ? sug.project_id : null;
      const confidence = sug ? sug.confidence : null;

      const row = document.createElement('div');
      row.className = 'ext-projalloc-row';

      const info = document.createElement('div');
      info.className = 'ext-projalloc-row-info';
      const title = document.createElement('div');
      title.className = 'ext-projalloc-row-title';
      title.textContent = s.title || '(Untitled)';
      title.title = s.title || '';
      
      // Last user message preview (fetched async below)
      const msgEl = document.createElement('div');
      msgEl.className = 'ext-projalloc-row-message';
      msgEl.id = 'msg-' + s.session_id;
      msgEl.textContent = s._lastUserMessage || '';

      const meta = document.createElement('div');
      meta.className = 'ext-projalloc-row-meta';
      meta.textContent = [s.last_message_at ? new Date(s.last_message_at * 1000).toLocaleDateString() : '', s.source_tag, s.model].filter(Boolean).join(' · ');
      
      info.appendChild(title);
      info.appendChild(msgEl);
      info.appendChild(meta);
      row.appendChild(info);

      if (confidence) {
        const confEl = document.createElement('span');
        confEl.className = 'ext-projalloc-confidence ext-projalloc-confidence-' + confidence;
        confEl.textContent = confidence;
        row.appendChild(confEl);
      }

      const sugEl = document.createElement('div');
      sugEl.className = 'ext-projalloc-suggestion';
      const select = document.createElement('select');
      select.className = 'ext-projalloc-proj-select';
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = suggestedPid ? getProjectName(suggestedPid) : '(pick project)';
      defaultOpt.disabled = true;
      defaultOpt.selected = true;
      select.appendChild(defaultOpt);
      state.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.project_id;
        opt.textContent = p.name;
        if (p.project_id === suggestedPid) opt.selected = true;
        select.appendChild(opt);
      });
      sugEl.appendChild(select);

      const assignBtn = document.createElement('button');
      assignBtn.className = 'ext-projalloc-action-btn assign-btn';
      assignBtn.textContent = '✓';
      assignBtn.title = 'Assign to selected project';
      assignBtn.onclick = () => { const pid = select.value; if (pid) assignSession(s.session_id, pid); };
      assignBtn.disabled = !suggestedPid && !select.value;
      select.onchange = () => { assignBtn.disabled = !select.value; };
      sugEl.appendChild(assignBtn);
      row.appendChild(sugEl);
      body.appendChild(row);
    });
  }

  /* ── Toggle ── */
  function togglePanel(forceState) {
    const panel = document.getElementById('ext-projalloc-panel');
    if (!panel) return;
    const visible = forceState !== undefined ? forceState : !state.panelVisible;
    state.panelVisible = visible;
    panel.classList.toggle('ext-projalloc-hidden', !visible);

    if (visible) {
      refresh().then(() => {
        if (getSetting('suggest_on_open', true) && getUnassigned().length > 0 && Object.keys(state.suggestions).length === 0) {
          suggestProjects();
        }
      });
    }
  }

  async function refresh() {
    try {
      await fetchData();
      renderBody();
      // Fetch last user messages in background (non-blocking)
      fetchLastUserMessages().then(() => {
        // Update message elements in place
        state.sessions.forEach(s => {
          if (s._lastUserMessage) {
            const el = document.getElementById('msg-' + s.session_id);
            if (el) el.textContent = s._lastUserMessage;
          }
        });
      });
    } catch (err) {
      console.warn('[ProjAlloc] refresh failed:', err);
      showToast('Failed to load data: ' + err.message, 'error');
    }
  }

  /* ── Init ── */
  function install() {
    if (document.getElementById('ext-projalloc-panel')) return;
    loadUndoStack();

    // Inject CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = '/extensions/project-allocator/assets/project-allocator.css';
    document.head.appendChild(cssLink);

    // Build and inject the floating panel (hidden initially)
    const panel = buildPanel();
    panel.classList.add('ext-projalloc-hidden');
    document.body.appendChild(panel);
    state._panelEl = panel;

    // Inject button into existing .project-bar
    injectProjectBarButton();
    // Start observer for re-renders
    startBarObserver();

    // Periodic refresh while panel is open
    setInterval(() => {
      if (state.panelVisible) {
        const currentCount = state.sessions.length;
        if (typeof _allSessions !== 'undefined' && _allSessions.length !== currentCount) {
          refresh();
        }
      }
    }, 5000);

    // Keyboard shortcut: Alt+P
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key === 'p') {
        e.preventDefault();
        togglePanel();
      }
    });

    console.log('[ProjAlloc] Extension loaded (project-bar mode).');
  }

  // Wait for DOM + core globals
  function waitForInit(attempt) {
    if (attempt > 80) { console.warn('[ProjAlloc] Timeout waiting for init'); return; }
    const ready = document.getElementById('messages') || (typeof _allSessions !== 'undefined');
    if (ready) {
      // Let sidebar populate first
      setTimeout(install, 800);
    } else {
      setTimeout(() => waitForInit(attempt + 1), 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForInit(0), { once: true });
  } else {
    waitForInit(0);
  }
})();
