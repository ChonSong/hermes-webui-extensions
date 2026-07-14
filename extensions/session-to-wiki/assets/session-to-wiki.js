/**
 * Session-to-Wiki extension
 *
 * Adds "Add to Wiki" to session menus and Ctrl+Shift+W shortcut.
 * Uses core's registerHermesSessionOpenHandler hook to track the active session.
 * Talks directly to core's POST /api/wiki/page endpoint.
 */
(function () {
  if (!window.registerHermesSessionOpenHandler) return;

  var currentSid = null;
  var currentSession = null;
  var modalState = null;

  var ICON = '📝'; // spark-wiki icon fallback
  var SECTIONS = ['concepts', 'entities', 'comparisons', 'queries'];

  function slugify(text) {
    var raw = String(text == null ? '' : text).trim().toLowerCase();
    var slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug.slice(0, 64) || 'untitled';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function api(path, opts) {
    opts = opts || {};
    if (!window._hermesFetch) return Promise.reject(new Error('api unavailable'));
    return window._hermesFetch(path, opts);
  }

  function closeModal() {
    var overlay = document.getElementById('stw-overlay');
    if (overlay) overlay.remove();
    if (modalState && modalState.lastFocus) {
      setTimeout(function () { if (modalState.lastFocus.focus) modalState.lastFocus.focus(); }, 0);
    }
    modalState = null;
  }

  function renderConflict(pageName, section) {
    var body = document.getElementById('stw-body');
    if (!body) return;
    body.innerHTML = '';
    var msg = document.createElement('p');
    msg.className = 'stw-msg';
    msg.innerHTML = 'A page named <strong>' + esc(pageName) + '</strong> already exists in <strong>' + esc(section) + '</strong>.';
    body.appendChild(msg);

    var footer = document.getElementById('stw-footer');
    if (footer) {
      footer.innerHTML = '';
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'stw-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', closeModal);
      var appendBtn = document.createElement('button');
      appendBtn.type = 'button';
      appendBtn.className = 'stw-btn primary';
      appendBtn.textContent = 'Append to bottom';
      appendBtn.id = 'stw-submit';
      appendBtn.addEventListener('click', function () { submit('append'); });
      footer.appendChild(cancelBtn);
      footer.appendChild(appendBtn);
      setTimeout(function () { appendBtn.focus(); }, 0);
    }
  }

  function submit(mode) {
    if (!modalState) return;
    var pageNameInput = modalState.pageNameInput;
    var sectionSelect = modalState.sectionSelect;
    var pageName = pageNameInput.value.trim() || slugify(currentSession && (currentSession.title || currentSid));
    var section = sectionSelect.value;
    modalState.mode = mode;

    var submitBtn = document.getElementById('stw-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

    api('/api/wiki/page', {
      method: 'POST',
      body: JSON.stringify({ session_id: currentSid, page_name: pageName, section: section, mode: mode }),
    }).then(function (res) {
      if (res && res.error === 'exists') {
        renderConflict(pageName, section);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save to Wiki'; }
        return;
      }
      if (res && res.error) {
        window.showToast && window.showToast('Error: ' + res.error, 5000, 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save to Wiki'; }
        return;
      }
      closeModal();
      var verb = res.appended ? 'Appended to' : 'Saved to';
      window.showToast && window.showToast(verb + ' ' + res.path, 3500, 'success');
    }).catch(function (err) {
      var msg = 'Save failed: ' + (err && err.message ? err.message : String(err || ''));
      window.showToast && window.showToast(msg, 5000, 'error');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save to Wiki'; }
    });
  }

  function openModal() {
    if (!currentSid) { window.showToast && window.showToast('No session selected.', 3000); return; }

    closeModal();
    modalState = { mode: 'create', lastFocus: document.activeElement };

    var overlay = document.createElement('div');
    overlay.id = 'stw-overlay';
    overlay.className = 'stw-overlay';

    var card = document.createElement('div');
    card.className = 'stw-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'stw-title');
    card.setAttribute('aria-modal', 'true');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var body = document.createElement('div');
    body.id = 'stw-body';
    body.className = 'stw-body';

    var titleEl = document.createElement('h3');
    titleEl.id = 'stw-title';
    titleEl.textContent = 'Save to Wiki';
    body.appendChild(titleEl);

    var pageLabel = document.createElement('label');
    pageLabel.className = 'stw-label';
    pageLabel.textContent = 'Page name';
    body.appendChild(pageLabel);

    var pageNameInput = document.createElement('input');
    pageNameInput.type = 'text';
    pageNameInput.className = 'stw-input';
    pageNameInput.value = slugify(currentSession && (currentSession.title || currentSid));
    pageNameInput.placeholder = 'untitled';
    pageNameInput.setAttribute('aria-label', 'Page name');
    body.appendChild(pageNameInput);

    var sectLabel = document.createElement('label');
    sectLabel.className = 'stw-label';
    sectLabel.textContent = 'Section';
    body.appendChild(sectLabel);

    var sectionSelect = document.createElement('select');
    sectionSelect.className = 'stw-select';
    sectionSelect.setAttribute('aria-label', 'Section');
    SECTIONS.forEach(function (sec) {
      var opt = document.createElement('option');
      opt.value = sec;
      opt.textContent = sec;
      if (sec === 'concepts') opt.selected = true;
      sectionSelect.appendChild(opt);
    });
    body.appendChild(sectionSelect);
    card.appendChild(body);

    var footer = document.createElement('div');
    footer.id = 'stw-footer';
    footer.className = 'stw-footer';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'stw-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);

    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.id = 'stw-submit';
    submitBtn.className = 'stw-btn primary';
    submitBtn.textContent = 'Save to Wiki';
    submitBtn.addEventListener('click', function () { submit('create'); });

    footer.appendChild(cancelBtn);
    footer.appendChild(submitBtn);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    modalState.pageNameInput = pageNameInput;
    modalState.sectionSelect = sectionSelect;

    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
      if (e.key === 'Enter') {
        var target = e.target;
        if (target && target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        submit(modalState.mode);
      }
    });

    setTimeout(function () { submitBtn.focus(); }, 0);
  }

  function getSessionMeta() {
    return { default_section: 'concepts' };
  }

  function appendMenuAction(menu, session) {
    if (!menu || !session) return;
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'session-action-item';
    item.innerHTML = '<span class="session-action-icon">' + ICON + '</span>' +
      '<span class="session-action-text">' +
        '<span class="session-action-title">Add to wiki</span>' +
        '<span class="session-action-desc">Save this conversation as a wiki page</span>' +
      '</span>';
    item.addEventListener('click', function () {
      currentSid = session.session_id;
      currentSession = session;
      openModal();
    });
    menu.appendChild(item);
  }

  window.registerHermesSessionOpenHandler(function (sid, data, opts) {
    opts = opts || {};
    if (opts.loaded) {
      currentSid = sid;
      if (data) currentSession = data;
    }
    if (opts.preload) {
      currentSid = sid;
    }
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
      var target = e.target;
      var isText = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (!isText && currentSid) {
        e.preventDefault();
        openModal();
        return;
      }
    }
  });

  window.SessionToWiki = {
    open: openModal,
    appendMenuAction: appendMenuAction,
    getCurrentSession: function () { return currentSession; }
  };
})();
